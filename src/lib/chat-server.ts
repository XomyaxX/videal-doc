import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "./prisma";
import { fullName, shortName } from "./names";
import { sendWebPushToUser } from "./push";
import { assertInside, fileRoot } from "./files";
import { userCan, type SessionUser } from "./types";
import { decryptBytesDisk, decryptPayload, decryptText, encryptBytesDisk, encryptPayload, encryptText, getChatDek } from "./chat-key";
import { previewText, type ChatPayload } from "./chat-types";

export type ChatPerson = {
  id: string;
  fullName: string;
  shortName: string;
  lastName: string;
  firstName: string;
  photoFileId: string;
  departmentName: string | null;
  hasIdentity: boolean;
  lastSeenAt: string | null;
};

export async function lastSeenMap(userIds: string[]): Promise<Map<string, Date>> {
  const map = new Map<string, Date>();
  if (userIds.length === 0) return map;
  const rows = await prisma.session.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, lastSeenAt: true },
    orderBy: { lastSeenAt: "desc" },
  });
  for (const r of rows) {
    if (!map.has(r.userId)) map.set(r.userId, r.lastSeenAt);
  }
  return map;
}

export function toPerson(
  u: {
    id: string;
    lastName: string;
    firstName: string;
    middleName: string;
    photoFileId: string;
    department: { name: string } | null;
  },
  extra: { hasIdentity: boolean; lastSeenAt: Date | null },
): ChatPerson {
  return {
    id: u.id,
    fullName: fullName(u),
    shortName: shortName(u),
    lastName: u.lastName,
    firstName: u.firstName,
    photoFileId: u.photoFileId,
    departmentName: u.department?.name ?? null,
    hasIdentity: extra.hasIdentity,
    lastSeenAt: extra.lastSeenAt ? extra.lastSeenAt.toISOString() : null,
  };
}

export async function activeChatMember(userId: string, chatId: string) {
  return prisma.chatMember.findFirst({
    where: { userId, chatId, leftAt: null },
    include: { chat: true },
  });
}

export function canHoldChatKey(user: { roleCode: string; permissions: string[] }) {
  return user.roleCode === "superadmin" || user.roleCode === "admin" || userCan(user, "admin.settings");
}

export async function requireMember(user: SessionUser, chatId: string) {
  const row = await activeChatMember(user.id, chatId);
  if (row) return { ...row, adminView: false, canWrite: true };
  if (!canHoldChatKey(user)) return null;
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) return null;
  return {
    id: "",
    chatId,
    userId: user.id,
    role: "owner",
    unreadCount: 0,
    mutedUntil: null,
    pinnedAt: null,
    lastReadAt: null,
    lastReadMessageId: "",
    joinedAt: new Date(),
    leftAt: null,
    chat,
    adminView: true,
    canWrite: false,
  };
}

export async function bumpUnread(chatId: string, exceptUserId: string) {
  await prisma.chatMember.updateMany({
    where: { chatId, userId: { not: exceptUserId }, leftAt: null },
    data: { unreadCount: { increment: 1 } },
  });
}

export async function touchChatSeen(userId: string) {
  await prisma.session.updateMany({
    where: { userId, expiresAt: { gt: new Date() } },
    data: { lastSeenAt: new Date() },
  });
}

export function resolveMentions(
  text: string,
  members: { id: string; lastName: string; firstName: string; login?: string }[],
  extraIds: string[] = [],
) {
  const ids = new Set(extraIds.filter(Boolean));
  const lower = (text || "").toLowerCase();
  for (const m of members) {
    const tags = [`@${m.lastName}`, `@${m.firstName}`];
    if (m.login) tags.push(`@${m.login}`);
    if (lower.includes(`@${m.lastName} ${m.firstName}`.toLowerCase())) ids.add(m.id);
    else if (tags.some((t) => lower.includes(t.toLowerCase()))) ids.add(m.id);
  }
  return [...ids];
}

export async function notifyChatMentions(opts: {
  chatId: string;
  authorId: string;
  text: string;
  mentionIds?: string[];
}) {
  const [members, author] = await Promise.all([
    prisma.chatMember.findMany({
      where: { chatId: opts.chatId, leftAt: null, userId: { not: opts.authorId } },
      include: {
        user: { select: { id: true, lastName: true, firstName: true, login: true } },
      },
    }),
    prisma.user.findUnique({
      where: { id: opts.authorId },
      include: { role: true },
    }),
  ]);
  const { leadershipFromRole } = await import("./chat-official");
  const fromLead = author ? leadershipFromRole(author.role) : false;
  const tagged = new Set(
    resolveMentions(
      opts.text,
      members.map((m) => m.user),
      opts.mentionIds || [],
    ),
  );
  const now = new Date();
  for (const m of members) {
    const hit = fromLead || tagged.has(m.userId);
    if (!hit) continue;
    if (!fromLead && m.mutedUntil && m.mutedUntil > now) continue;
    void sendWebPushToUser(m.userId, {
      title: fromLead ? "Сообщение от руководства" : "Вас отметили в чате",
      body: "Откройте чат",
      link: `/chat/${opts.chatId}`,
    }).catch((e) => console.error("push.chat", e));
  }
}

export async function findOrCreateDirect(a: string, b: string) {
  const existing = await findDirectChat(a, b);
  if (existing) return { id: existing, existing: true };
  const chat = await prisma.chat.create({
    data: {
      kind: "direct",
      keyGen: 0,
      members: { create: [{ userId: a, role: "member" }, { userId: b, role: "member" }] },
    },
  });
  const again = await findDirectChat(a, b);
  if (again && again !== chat.id) {
    const mine = await prisma.chatMessage.count({ where: { chatId: chat.id } });
    if (mine === 0) await prisma.chat.delete({ where: { id: chat.id } }).catch(() => {});
    return { id: again, existing: true };
  }
  return { id: chat.id, existing: false };
}

export async function identityPublicMap(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;
  const rows = await prisma.chatIdentity.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, publicKey: true },
  });
  for (const r of rows) map.set(r.userId, r.publicKey);
  return map;
}

export function isAdminRole(role: string) {
  return role === "owner" || role === "admin";
}

export async function findDirectChat(a: string, b: string) {
  const mine = await prisma.chatMember.findMany({
    where: { userId: a, leftAt: null, chat: { kind: "direct" } },
    select: { chatId: true },
  });
  if (mine.length === 0) return null;
  const other = await prisma.chatMember.findFirst({
    where: { userId: b, leftAt: null, chatId: { in: mine.map((x) => x.chatId) }, chat: { kind: "direct" } },
    select: { chatId: true },
  });
  return other?.chatId || null;
}

export async function chatUnreadTotal(userId: string) {
  const agg = await prisma.chatMember.aggregate({
    where: { userId, leftAt: null },
    _sum: { unreadCount: true },
  });
  return agg._sum.unreadCount || 0;
}

export async function saveEncryptedBlob(opts: {
  chatId: string;
  userId: string;
  buffer: Buffer;
  maxBytes: number;
  mime?: string;
  originalName?: string;
}) {
  if (opts.buffer.length === 0) throw new Error("Пустой файл");
  if (opts.buffer.length > opts.maxBytes) throw new Error("Файл слишком большой");
  const dek = await getChatDek();
  const enc = encryptBytesDisk(dek, opts.buffer);
  const id = randomUUID();
  const rel = path.posix.join("chat", opts.chatId, `${id}.bin`);
  const dir = path.join(/* turbopackIgnore: true */ fileRoot(), "chat", opts.chatId);
  await mkdir(dir, { recursive: true });
  const abs = assertInside(fileRoot(), path.join(/* turbopackIgnore: true */ fileRoot(), rel));
  await writeFile(/* turbopackIgnore: true */ abs, enc.bytes);
  return prisma.chatBlob.create({
    data: {
      id,
      chatId: opts.chatId,
      size: opts.buffer.length,
      path: rel,
      iv: enc.iv,
      mime: (opts.mime || "").slice(0, 120),
      originalName: (opts.originalName || "").slice(0, 200),
      createdById: opts.userId,
    },
  });
}

export async function readEncryptedBlob(id: string) {
  const rec = await prisma.chatBlob.findUnique({ where: { id } });
  if (!rec) return null;
  if (rec.path.includes("..") || path.isAbsolute(rec.path)) return null;
  const abs = assertInside(fileRoot(), path.join(/* turbopackIgnore: true */ fileRoot(), rec.path));
  const raw = await readFile(/* turbopackIgnore: true */ abs);
  try {
    const dek = await getChatDek();
    const buffer = decryptBytesDisk(dek, rec.iv, raw);
    return { rec, buffer };
  } catch {
    return { rec, buffer: raw, opaque: true as const };
  }
}

export async function openPayload(iv: string, ciphertext: string): Promise<ChatPayload | null> {
  return decryptPayload(iv, ciphertext);
}

export async function sealPayload(payload: ChatPayload) {
  return encryptPayload(payload);
}

export async function openTitle(iv: string, cipher: string) {
  return decryptText(iv, cipher);
}

export async function sealTitle(title: string) {
  return encryptText(title);
}

export function payloadPreview(p: ChatPayload | null) {
  return previewText(p);
}

export type WrapIn = { userId: string; gen: number; ephPub: string; wrap: string; wrapIv: string };

export function validWraps(rows: unknown): WrapIn[] {
  if (!Array.isArray(rows)) return [];
  const out: WrapIn[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const userId = String(r.userId || "");
    const ephPub = String(r.ephPub || "");
    const wrap = String(r.wrap || "");
    const wrapIv = String(r.wrapIv || "");
    const gen = Number(r.gen || 0);
    if (!userId || !ephPub || !wrap || !wrapIv) continue;
    if (!Number.isInteger(gen) || gen < 0 || gen > 10_000) continue;
    out.push({ userId, gen, ephPub: ephPub.slice(0, 200), wrap: wrap.slice(0, 4000), wrapIv: wrapIv.slice(0, 64) });
  }
  return out;
}

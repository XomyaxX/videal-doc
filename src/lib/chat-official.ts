import { prisma } from "./prisma";
import { userCan } from "./types";
import { parsePermissions } from "./permissions";
import { encryptText } from "./chat-key";

export function isLeadership(user: { roleCode: string; permissions: string[] }) {
  return (
    user.roleCode === "superadmin" ||
    user.roleCode === "admin" ||
    user.roleCode === "manager" ||
    userCan(user, "users.manage")
  );
}

export function isOfficialKind(kind: string) {
  return kind === "studio" || kind === "dept";
}

async function ensureChat(kind: string, departmentId: string, title: string) {
  const found = await prisma.chat.findFirst({
    where: kind === "studio" ? { kind: "studio" } : { kind: "dept", departmentId },
  });
  const enc = await encryptText(title);
  if (found) {
    if (found.titleCipher !== enc.ciphertext) {
      await prisma.chat.update({
        where: { id: found.id },
        data: { titleCipher: enc.ciphertext, titleIv: enc.iv },
      });
    }
    return found.id;
  }
  const row = await prisma.chat.create({
    data: {
      kind,
      departmentId,
      titleCipher: enc.ciphertext,
      titleIv: enc.iv,
    },
  });
  return row.id;
}

async function setMembers(chatId: string, userIds: string[]) {
  const want = new Set(userIds);
  const current = await prisma.chatMember.findMany({ where: { chatId } });
  for (const row of current) {
    if (want.has(row.userId)) {
      if (row.leftAt) await prisma.chatMember.update({ where: { id: row.id }, data: { leftAt: null } });
    } else if (!row.leftAt) {
      await prisma.chatMember.update({ where: { id: row.id }, data: { leftAt: new Date(), unreadCount: 0 } });
    }
  }
  const have = new Set(current.map((c) => c.userId));
  const add = userIds.filter((id) => !have.has(id));
  if (add.length) {
    await prisma.chatMember.createMany({ data: add.map((userId) => ({ chatId, userId, role: "member" })) });
  }
}

let lastSync = 0;

export async function syncOfficialChats(force = false) {
  if (!force && Date.now() - lastSync < 20_000) return;
  lastSync = Date.now();
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, departmentId: true },
  });
  const ids = people.map((p) => p.id);
  const studioId = await ensureChat("studio", "", "Студия");
  await setMembers(studioId, ids);

  const depts = await prisma.department.findMany({ where: { deletedAt: null } });
  const liveDept = new Set(depts.map((d) => d.id));
  for (const d of depts) {
    const chatId = await ensureChat("dept", d.id, d.name);
    await setMembers(
      chatId,
      people.filter((p) => p.departmentId === d.id).map((p) => p.id),
    );
  }
  const stale = await prisma.chat.findMany({ where: { kind: "dept", departmentId: { notIn: [...liveDept, ""] } } });
  for (const c of stale) {
    await prisma.chatMember.updateMany({ where: { chatId: c.id, leftAt: null }, data: { leftAt: new Date(), unreadCount: 0 } });
  }
}

export function leadershipFromRole(role: { code: string; permissions: string }) {
  return isLeadership({ roleCode: role.code, permissions: parsePermissions(role.permissions) });
}

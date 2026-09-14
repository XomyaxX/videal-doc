import { prisma } from "./prisma";
import { bumpUnread, requireMember, sealPayload } from "./chat-server";
import { notify } from "./notify";
import { fullName } from "./names";
import type { ChatAskDto, ChatPayload, ChatPollDto, ChatTaskDto } from "./chat-types";
import type { SessionUser } from "./types";

export async function postChatCard(opts: {
  chatId: string;
  userId: string;
  type: "poll" | "ask" | "task";
  text: string;
  extra?: Partial<Pick<ChatPayload, "pollId" | "askId" | "taskId">>;
}) {
  const payload: ChatPayload = { v: 1, t: opts.type, text: opts.text, ...opts.extra };
  const sealed = await sealPayload(payload);
  const msg = await prisma.chatMessage.create({
    data: {
      chatId: opts.chatId,
      authorId: opts.userId,
      type: opts.type,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      size: sealed.ciphertext.length,
    },
  });
  await prisma.chat.update({ where: { id: opts.chatId }, data: { lastMessageAt: msg.createdAt } });
  await bumpUnread(opts.chatId, opts.userId);
  return msg;
}

export function serializePoll(
  poll: {
    id: string;
    question: string;
    multi: boolean;
    closedAt: Date | null;
    authorId: string;
    options: { id: string; text: string; sortOrder: number; votes: { userId: string }[] }[];
  },
  meId: string,
): ChatPollDto {
  const options = [...poll.options]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((o) => ({
      id: o.id,
      text: o.text,
      count: o.votes.length,
      me: o.votes.some((v) => v.userId === meId),
    }));
  return {
    id: poll.id,
    question: poll.question,
    multi: poll.multi,
    closed: Boolean(poll.closedAt),
    authorId: poll.authorId,
    total: options.reduce((s, o) => s + o.count, 0),
    options,
  };
}

function parseBlobJson(raw: string): string[] {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export async function serializeAsk(
  ask: {
    id: string;
    title: string;
    body: string;
    authorId: string;
    targets: { userId: string; user: { lastName: string; firstName: string; middleName: string; photoFileId: string } }[];
    replies: {
      userId: string;
      empty: boolean;
      text: string;
      blobJson: string;
      createdAt: Date;
      user: { lastName: string; firstName: string; middleName: string };
    }[];
  },
): Promise<ChatAskDto> {
  const blobIds = [...new Set(ask.replies.flatMap((r) => parseBlobJson(r.blobJson)))];
  const blobs = blobIds.length
    ? await prisma.chatBlob.findMany({
        where: { id: { in: blobIds } },
        select: { id: true, originalName: true, mime: true, size: true },
      })
    : [];
  const byId = Object.fromEntries(blobs.map((b) => [b.id, b]));
  return {
    id: ask.id,
    title: ask.title,
    body: ask.body,
    authorId: ask.authorId,
    targets: ask.targets.map((t) => ({
      id: t.userId,
      name: fullName(t.user),
      photoFileId: t.user.photoFileId,
    })),
    replies: ask.replies.map((r) => ({
      userId: r.userId,
      name: fullName(r.user),
      empty: r.empty,
      text: r.text,
      files: parseBlobJson(r.blobJson).map((id) => ({
        id,
        name: byId[id]?.originalName || "файл",
        mime: byId[id]?.mime || "",
        size: byId[id]?.size || 0,
      })),
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export function serializeTask(task: {
  id: string;
  chatId: string;
  title: string;
  body: string;
  authorId: string;
  assigneeId: string | null;
  dueAt: Date | null;
  status: string;
  kind?: string | null;
  prodTaskId: string;
  parentId?: string | null;
  parent?: { title: string } | null;
  linkedTask?: { id: string; title: string; stage: string; shot?: { code: string } | null; scene?: { code: string } | null; asset?: { name: string } | null } | null;
  linkedJob?: { id: string; title: string } | null;
  author?: { lastName: string; firstName: string; middleName: string } | null;
  assignee: { lastName: string; firstName: string; middleName: string } | null;
}): ChatTaskDto {
  let linkLabel = "";
  let linkHref = "";
  if (task.linkedJob) {
    linkLabel = task.linkedJob.title;
    linkHref = `/prod/jobs/${task.linkedJob.id}`;
  } else if (task.linkedTask) {
    const t = task.linkedTask;
    linkLabel = t.title?.trim() || (t.scene && t.shot ? `${t.scene.code} · ${t.shot.code}` : t.asset?.name || t.stage);
    linkHref = `/prod/tasks/${t.id}`;
  } else if (task.prodTaskId) {
    linkHref = `/prod/jobs/${task.prodTaskId}`;
    linkLabel = "в производстве";
  }
  const kind = task.kind || (task.parentId ? "sub" : "task");
  const kindLabel =
    kind === "epic"
      ? "Крупное поручение"
      : kind === "sub" || task.parent?.title
        ? `Подзадача${task.parent?.title ? ` · ${task.parent.title}` : ""}`
        : "Новая задача";
  return {
    id: task.id,
    chatId: task.chatId,
    title: task.title,
    body: task.body,
    authorId: task.authorId,
    authorName: task.author ? fullName(task.author) : "",
    assigneeId: task.assigneeId,
    assigneeName: task.assignee ? fullName(task.assignee) : "не назначен",
    dueAt: task.dueAt ? task.dueAt.toISOString() : null,
    status: task.status,
    kind,
    kindLabel,
    prodTaskId: task.prodTaskId || "",
    parentId: task.parentId || null,
    parentTitle: task.parent?.title || "",
    linkLabel,
    linkHref,
  };
}

const pollInclude = {
  options: { include: { votes: { select: { userId: true } } } },
} as const;

const askInclude = {
  targets: {
    include: {
      user: { select: { lastName: true, firstName: true, middleName: true, photoFileId: true } },
    },
  },
  replies: {
    include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
  },
} as const;

const taskInclude = {
  assignee: { select: { lastName: true, firstName: true, middleName: true } },
  author: { select: { lastName: true, firstName: true, middleName: true } },
  parent: { select: { title: true } },
  linkedJob: { select: { id: true, title: true } },
  linkedTask: {
    select: {
      id: true,
      title: true,
      stage: true,
      shot: { select: { code: true } },
      scene: { select: { code: true } },
      asset: { select: { name: true } },
    },
  },
} as const;

export async function loadCardsForMessages(messageIds: string[], meId: string) {
  if (!messageIds.length) return { polls: new Map<string, ChatPollDto>(), asks: new Map<string, ChatAskDto>(), tasks: new Map<string, ChatTaskDto>() };
  const [polls, asks, tasks] = await Promise.all([
    prisma.chatPoll.findMany({ where: { messageId: { in: messageIds } }, include: pollInclude }),
    prisma.chatAsk.findMany({ where: { messageId: { in: messageIds } }, include: askInclude }),
    prisma.chatTask.findMany({ where: { messageId: { in: messageIds } }, include: taskInclude }),
  ]);
  const pollMap = new Map<string, ChatPollDto>();
  for (const p of polls) pollMap.set(p.messageId, serializePoll(p, meId));
  const askMap = new Map<string, ChatAskDto>();
  for (const a of asks) askMap.set(a.messageId, await serializeAsk(a));
  const taskMap = new Map<string, ChatTaskDto>();
  for (const t of tasks) taskMap.set(t.messageId, serializeTask(t));
  return { polls: pollMap, asks: askMap, tasks: taskMap };
}

export async function assertChatWriter(user: SessionUser, chatId: string) {
  const member = await requireMember(user, chatId);
  if (!member || !member.canWrite) throw new Error("Нет чата");
  return member;
}

export async function notifyChatMembers(opts: {
  chatId: string;
  exceptUserId: string;
  onlyUserIds?: string[];
  title: string;
  body: string;
}) {
  const members = await prisma.chatMember.findMany({
    where: {
      chatId: opts.chatId,
      leftAt: null,
      AND: [
        { userId: { not: opts.exceptUserId } },
        opts.onlyUserIds ? { userId: { in: opts.onlyUserIds } } : {},
      ],
    },
    select: { userId: true },
  });
  for (const m of members) {
    await notify({
      userId: m.userId,
      title: opts.title,
      body: opts.body,
      link: `/chat/${opts.chatId}`,
      urgency: "normal",
    });
  }
}

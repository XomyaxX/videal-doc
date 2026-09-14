export type ChatPayload = {
  v: 1;
  t: "text" | "file" | "voice" | "system" | "poll" | "ask" | "task";
  text?: string;
  replyTo?: string;
  files?: { blobId: string; name: string; mime: string; size: number; previewBlobId?: string }[];
  voice?: { blobId: string; mime: string; durationMs: number; text?: string };
  system?: { kind: string; userId?: string; extra?: string };
  pollId?: string;
  askId?: string;
  taskId?: string;
};

export type ChatPollDto = {
  id: string;
  question: string;
  multi: boolean;
  closed: boolean;
  authorId: string;
  total: number;
  options: { id: string; text: string; count: number; me: boolean }[];
};

export type ChatAskBlob = { id: string; name: string; mime: string; size: number };

export type ChatAskDto = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  targets: { id: string; name: string; photoFileId: string }[];
  replies: {
    userId: string;
    name: string;
    empty: boolean;
    text: string;
    files: ChatAskBlob[];
    createdAt: string;
  }[];
};

export type ChatTaskDto = {
  id: string;
  chatId: string;
  title: string;
  body: string;
  authorId: string;
  authorName: string;
  assigneeId: string | null;
  assigneeName: string;
  dueAt: string | null;
  status: string;
  kind: string;
  kindLabel: string;
  prodTaskId: string;
  parentId: string | null;
  parentTitle: string;
  linkLabel: string;
  linkHref: string;
};

export function previewText(p: ChatPayload | null | undefined): string {
  if (!p) return "";
  if (p.t === "voice") {
    const t = (p.voice?.text || p.text || "").trim();
    return t ? `Голосовое: ${t.slice(0, 60)}` : "Голосовое";
  }
  if (p.t === "file") return p.files?.[0]?.name || "Файл";
  if (p.t === "poll") return `Голосование: ${(p.text || "").slice(0, 60)}`;
  if (p.t === "ask") return `Нужен ответ: ${(p.text || "").slice(0, 60)}`;
  if (p.t === "task") return `Поручение: ${(p.text || "").slice(0, 60)}`;
  if (p.t === "system") {
    if (p.system?.kind === "create") return "Группа создана";
    if (p.system?.kind === "add") return "Добавлен участник";
    if (p.system?.kind === "remove") return "Участник убран";
    if (p.system?.kind === "leave") return "Кто-то вышел";
    if (p.system?.kind === "title") return "Название изменено";
    return "Служебное";
  }
  return (p.text || "").slice(0, 80);
}

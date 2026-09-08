export type ChatPayload = {
  v: 1;
  t: "text" | "file" | "voice" | "system";
  text?: string;
  replyTo?: string;
  files?: { blobId: string; name: string; mime: string; size: number }[];
  voice?: { blobId: string; mime: string; durationMs: number };
  system?: { kind: string; userId?: string; extra?: string };
};

export function previewText(p: ChatPayload | null | undefined): string {
  if (!p) return "";
  if (p.t === "voice") return "Голосовое";
  if (p.t === "file") return p.files?.[0]?.name || "Файл";
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

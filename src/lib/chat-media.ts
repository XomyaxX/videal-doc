export type MediaTab = "media" | "files" | "links" | "voices";

export type MediaItem = {
  id: string;
  tab: MediaTab;
  messageId: string;
  createdAt: string;
  authorName: string;
  blobId?: string;
  mime?: string;
  name?: string;
  size?: number;
  durationMs?: number;
  text?: string;
  url?: string;
};

export type TextPart = { t: "text" | "url" | "mention"; value: string; href?: string };

const URL_RE = /https?:\/\/[^\s<>"'\]\)]+|www\.[^\s<>"'\]\)]+/gi;

export function normalizeUrl(raw: string): string {
  const trimmed = raw.replace(/[.,;:!?]+$/g, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const found = text.match(URL_RE) || [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const href = normalizeUrl(raw);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    out.push(href);
  }
  return out;
}

function splitMentions(text: string): TextPart[] {
  if (!text) return [];
  const parts: TextPart[] = [];
  const re = /(@\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: "text", value: text.slice(last, m.index) });
    parts.push({ t: "mention", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: "text", value: text.slice(last) });
  return parts;
}

export function splitMessageText(text: string): TextPart[] {
  if (!text) return [];
  const parts: TextPart[] = [];
  const re = new RegExp(URL_RE.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(...splitMentions(text.slice(last, m.index)));
    const raw = m[0];
    parts.push({ t: "url", value: raw, href: normalizeUrl(raw) });
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push(...splitMentions(text.slice(last)));
  return parts.length ? parts : [{ t: "text", value: text }];
}

export function formatVoiceTime(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatFileSize(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}

function localDayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return localDayKey(d);
}

export function dayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  if (localDayKey(d) === localDayKey(today)) return "Сегодня";
  const yest = new Date(today);
  yest.setDate(today.getDate() - 1);
  if (localDayKey(d) === localDayKey(yest)) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function blobTab(mime: string, type?: string): MediaTab | null {
  if (type === "voice" || mime.startsWith("audio/")) return "voices";
  if (mime.startsWith("image/") || mime.startsWith("video/")) return "media";
  if (mime) return "files";
  return null;
}

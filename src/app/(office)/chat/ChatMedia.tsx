"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Link2, Mic } from "lucide-react";
import { formatFileSize, formatVoiceTime, type MediaItem, type MediaTab } from "@/lib/chat-media";
import { VoicePlayer } from "./VoicePlayer";
import { GlbPreview } from "@/components/ModelPreview";

const TABS: { id: MediaTab; label: string }[] = [
  { id: "media", label: "Медиа" },
  { id: "files", label: "Файлы" },
  { id: "links", label: "Ссылки" },
  { id: "voices", label: "Голосовые" },
];

export function PhotoLightbox({
  src,
  alt,
  onClose,
  kind = "image",
}: {
  src: string;
  alt: string;
  onClose: () => void;
  kind?: "image" | "model3d";
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-navy/90 p-2" onClick={onClose}>
      <p className="shrink-0 truncate px-2 py-1 text-sm text-white/80">{alt}</p>
      <div className="min-h-0 flex-1" onClick={(e) => e.stopPropagation()}>
        {kind === "model3d" ? (
          <GlbPreview src={src} tall className="h-full overflow-hidden rounded-xl" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="mx-auto max-h-full max-w-full object-contain" />
        )}
      </div>
    </div>
  );
}

export function ChatMedia({
  chatId,
  onJump,
}: {
  chatId: string;
  onJump: (messageId: string) => void;
}) {
  const [tab, setTab] = useState<MediaTab>("media");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<{ src: string; alt: string } | null>(null);

  const load = useCallback(
    async (nextTab: MediaTab, nextCursor: string | null, append: boolean) => {
      setBusy(true);
      const q = new URLSearchParams({ tab: nextTab });
      if (nextCursor) q.set("cursor", nextCursor);
      const res = await fetch(`/api/chat/${chatId}/media?${q}`);
      const data = await res.json().catch(() => ({}));
      const list: MediaItem[] = data.items || [];
      setItems((prev) => (append ? [...prev, ...list] : list));
      setCursor(data.nextCursor || null);
      setBusy(false);
    },
    [chatId],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(tab, null, false);
  }, [tab, load]);

  return (
    <div className="mt-4">
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`px-3 py-2 text-sm ${tab === t.id ? "border-b-2 border-gold font-semibold text-navy" : "text-muted"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="mt-3 max-h-[40vh] overflow-auto">
        {!items.length && !busy ? <p className="py-6 text-center text-sm text-muted">Пока пусто</p> : null}
        {tab === "media" ? (
          <div className="grid grid-cols-3 gap-1">
            {items.map((it) => {
              const src = `/api/chat/blobs/${it.blobId}`;
              const video = (it.mime || "").startsWith("video/");
              return (
                <button
                  key={it.id}
                  type="button"
                  className="relative aspect-square overflow-hidden rounded-lg bg-paper"
                  onClick={() => (video ? onJump(it.messageId) : setPhoto({ src, alt: it.name || "фото" }))}
                >
                  {video ? (
                    <video src={src} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={it.name || ""} className="h-full w-full object-cover" />
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
        {tab === "files" ? (
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.id}>
                <a
                  href={`/api/chat/blobs/${it.blobId}`}
                  className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-paper"
                  download={it.name}
                >
                  <FileText size={16} className="text-navy" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy">{it.name || "Файл"}</span>
                    <span className="block text-[11px] text-muted">
                      {it.authorName} · {formatFileSize(it.size || 0)}
                    </span>
                  </span>
                </a>
                <button type="button" className="ml-8 text-[11px] text-muted underline" onClick={() => onJump(it.messageId)}>
                  к сообщению
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "links" ? (
          <ul className="space-y-1">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl px-2 py-2 hover:bg-paper">
                <a href={it.url} target="_blank" rel="noreferrer" className="flex items-start gap-2">
                  <Link2 size={16} className="mt-0.5 text-navy" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-sm font-semibold text-navy">{it.url}</span>
                    <span className="block text-[11px] text-muted">{it.authorName}</span>
                  </span>
                </a>
                <button type="button" className="ml-8 text-[11px] text-muted underline" onClick={() => onJump(it.messageId)}>
                  к сообщению
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {tab === "voices" ? (
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl border border-line bg-white p-2">
                <p className="mb-1 flex items-center gap-1 text-[11px] text-muted">
                  <Mic size={12} /> {it.authorName}
                  {it.durationMs ? ` · ${formatVoiceTime(it.durationMs)}` : ""}
                </p>
                {it.blobId ? <VoicePlayer src={`/api/chat/blobs/${it.blobId}`} durationMs={it.durationMs || 0} text={it.text} /> : null}
                <button type="button" className="mt-1 text-[11px] text-muted underline" onClick={() => onJump(it.messageId)}>
                  к сообщению
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {cursor ? (
          <button
            type="button"
            className="mt-3 block w-full py-2 text-center text-xs text-muted underline"
            disabled={busy}
            onClick={() => void load(tab, cursor, true)}
          >
            {busy ? "Загружаем…" : "Ещё"}
          </button>
        ) : null}
      </div>
      {photo ? <PhotoLightbox src={photo.src} alt={photo.alt} onClose={() => setPhoto(null)} /> : null}
    </div>
  );
}

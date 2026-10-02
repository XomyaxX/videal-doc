"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type Msg = { role: "user" | "assistant"; text: string };

function AnswerText({ text, onNavigate }: { text: string; onNavigate: () => void }) {
  const parts = text.split(/(\/[A-Za-z][A-Za-z0-9\-/_]*)/g);
  return parts.map((part, index) =>
    part.startsWith("/") ? (
      <Link key={index} href={part} className="font-semibold text-navy underline" onClick={onNavigate}>
        {part}
      </Link>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

export function ValeraPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Я Валера AI. Спроси, где раздел и что заполнить, или попроси написать текст.",
    },
  ]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
  }, [open]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [msgs, busy, open]);

  if (!open) return null;

  async function send() {
    const question = text.trim();
    if (!question || busy) return;
    const history = msgs
      .slice(-4)
      .map((item) => ({
        role: item.role,
        text:
          item.role === "assistant"
            ? item.text.replace(/\n*Развёрнутый ответ придёт позже\.?/g, "").trim()
            : item.text,
      }))
      .filter((item) => item.text);
    setText("");
    setError("");
    setBusy(true);
    setMsgs((cur) => [...cur, { role: "user", text: question }]);
    const preview = await fetch("/api/valera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, phase: "preview" }),
    }).catch(() => null);
    const previewData = await preview?.json().catch(() => ({}));
    if (!preview || !preview.ok || !previewData?.answer) {
      setBusy(false);
      setError(previewData?.error || "Не удалось спросить");
      return;
    }
    setMsgs((cur) => [...cur, { role: "assistant", text: String(previewData.answer) }]);
    const detail = await fetch("/api/valera", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, phase: "detail" }),
    }).catch(() => null);
    const detailData = await detail?.json().catch(() => ({}));
    setBusy(false);
    if (!detail || !detail.ok || !detailData?.answer) {
      setError(detailData?.error || "Валера сейчас не отвечает. Повтори чуть позже.");
      return;
    }
    setMsgs((cur) => [...cur, { role: "assistant", text: String(detailData.answer) }]);
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end bg-navy/40">
      <button type="button" className="absolute inset-0" aria-label="Закрыть Валеру" onClick={onClose} />
      <section className="relative flex h-full w-full max-w-md flex-col bg-paper shadow-2xl">
        <header className="flex items-center gap-3 bg-navy px-4 py-3 text-white">
          <div className="min-w-0 flex-1">
            <div className="font-serif text-xl leading-none">Валера AI</div>
            <div className="mt-1 text-xs text-white/70">Куда нажать и что заполнить</div>
          </div>
          <button type="button" className="rounded-xl p-2 hover:bg-white/10" aria-label="Закрыть" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {msgs.map((item, index) => (
            <div
              key={index}
              className={
                item.role === "user"
                  ? "ml-8 rounded-2xl bg-navy px-3 py-2 text-sm text-white"
                  : "mr-6 rounded-2xl border border-line bg-card px-3 py-2 text-sm text-navy"
              }
            >
              <p className="whitespace-pre-wrap">
                {item.role === "assistant" ? <AnswerText text={item.text} onNavigate={onClose} /> : item.text}
              </p>
            </div>
          ))}
          {busy ? <p className="text-sm text-muted">Валера думает…</p> : null}
          {error ? <p className="text-sm text-bad">{error}</p> : null}
        </div>
        <form
          className="border-t border-line bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            ref={field}
            value={text}
            maxLength={500}
            rows={2}
            placeholder="Например: как сдать авансовый"
            className="w-full resize-none rounded-xl border border-line bg-paper px-3 py-2 text-sm text-navy outline-none focus:border-gold"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="mt-2 w-full rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            Спросить
          </button>
        </form>
      </section>
    </div>,
    document.body,
  );
}

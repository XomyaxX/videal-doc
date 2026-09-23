"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

type Msg = { id: string; authorId: string; name: string; body: string; mine: boolean; at: string };

export function MeetChat({ meetingId, live, dark }: { meetingId: string; live?: boolean; dark?: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/meet/${meetingId}/chat`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMsgs(data.messages || []);
  }, [meetingId]);

  useEffect(() => {
    void load();
    if (!live) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [load, live]);

  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [msgs.length]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setText("");
    setErr("");
    const res = await fetch(`/api/meet/${meetingId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "Не отправилось");
    else void load();
  }

  return (
    <div className="flex h-full min-h-[220px] flex-col">
      <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {msgs.length ? (
          msgs.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl px-3 py-2 text-sm ${
                dark
                  ? m.mine
                    ? "ml-6 bg-gold/20 text-white"
                    : "mr-6 bg-white/15 text-white"
                  : m.mine
                    ? "ml-6 bg-navy/10"
                    : "mr-6 bg-paper"
              }`}
            >
              <p className={`text-xs ${dark ? "text-white/60" : "text-muted"}`}>{m.name}</p>
              <p className={`whitespace-pre-wrap ${dark ? "text-white" : "text-navy"}`}>{m.body}</p>
            </div>
          ))
        ) : (
          <p className={`text-sm ${dark ? "text-white/60" : "text-muted"}`}>Пока тихо. Пишите сюда — это чат только этого совещания.</p>
        )}
      </div>
      {err ? <p className="mt-1 text-xs text-bad">{err}</p> : null}
      {live ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <input
            className={`min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm ${dark ? "border-white/20 bg-white/10 text-white placeholder:text-white/40" : "border-line"}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder="Сообщение в созвон"
          />
          <Button type="submit">Ок</Button>
        </form>
      ) : null}
    </div>
  );
}

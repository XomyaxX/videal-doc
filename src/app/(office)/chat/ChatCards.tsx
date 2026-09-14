"use client";

import { useState } from "react";
import { Check, Paperclip } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/ui";
import type { ChatAskDto, ChatPollDto, ChatTaskDto } from "@/lib/chat-types";

export function PollCard({
  chatId,
  poll,
  meId,
  onUpdate,
}: {
  chatId: string;
  poll: ChatPollDto;
  meId: string;
  onUpdate: (next: ChatPollDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const max = Math.max(1, ...poll.options.map((o) => o.count));

  async function vote(optionId: string) {
    if (poll.closed || busy) return;
    setBusy(true);
    const res = await fetch(`/api/chat/${chatId}/polls/${poll.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.poll) onUpdate(data.poll);
  }

  async function close() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/chat/${chatId}/polls/${poll.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ close: true }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.poll) onUpdate(data.poll);
  }

  return (
    <div className="min-w-[220px] max-w-sm">
      <p className="font-semibold text-navy">{poll.question}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        {poll.multi ? "Можно несколько" : "Один вариант"}
        {poll.closed ? " · закрыто" : ""}
        {poll.total ? ` · ${poll.total}` : ""}
      </p>
      <div className="mt-2 space-y-1.5">
        {poll.options.map((o) => {
          const pct = poll.total ? Math.round((100 * o.count) / poll.total) : 0;
          return (
            <button
              key={o.id}
              type="button"
              disabled={poll.closed || busy}
              onClick={() => void vote(o.id)}
              className={`relative w-full overflow-hidden rounded-xl border px-3 py-2 text-left text-sm ${
                o.me ? "border-gold bg-[#fff8ec]" : "border-line bg-white"
              } disabled:opacity-80`}
            >
              <span
                className="absolute inset-y-0 left-0 bg-gold/20"
                style={{ width: poll.total ? `${Math.round((100 * o.count) / max)}%` : "0%" }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span className="font-medium text-navy">{o.text}</span>
                <span className="shrink-0 tabular-nums text-xs text-muted">
                  {o.me ? "✓ " : ""}
                  {o.count ? `${o.count} · ${pct}%` : ""}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {poll.authorId === meId && !poll.closed ? (
        <button type="button" className="mt-2 text-xs font-semibold text-gold" onClick={() => void close()}>
          Закрыть голосование
        </button>
      ) : null}
    </div>
  );
}

export function AskCard({
  chatId,
  ask,
  meId,
  onUpdate,
}: {
  chatId: string;
  ask: ChatAskDto;
  meId: string;
  onUpdate: (next: ChatAskDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const mine = ask.replies.find((r) => r.userId === meId);
  const pending = ask.targets.some((t) => t.id === meId) && !mine;

  async function send(blobIds: string[]) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/chat/${chatId}/asks/${ask.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empty, text, blobIds: empty ? [] : blobIds }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setErr(data.error || "Не отправилось");
    else if (data.ask) onUpdate(data.ask);
  }

  async function onFiles(list: FileList | null) {
    if (!list?.length || busy) return;
    setBusy(true);
    setErr("");
    const ids: string[] = [];
    for (const file of Array.from(list)) {
      const fd = new FormData();
      fd.set("file", file);
      const up = await fetch(`/api/chat/${chatId}/blobs`, { method: "POST", body: fd });
      const d = await up.json().catch(() => ({}));
      if (!up.ok) {
        setBusy(false);
        setErr(d.error || `Не загрузился «${file.name}»`);
        return;
      }
      ids.push(d.id);
    }
    setBusy(false);
    await send(ids);
  }

  return (
    <div className="min-w-[240px] max-w-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">Сбор ответов</p>
      <p className="font-semibold text-navy">{ask.title}</p>
      {ask.body ? <p className="mt-1 text-sm text-muted">{ask.body}</p> : null}
      <ul className="mt-2 space-y-1">
        {ask.targets.map((t) => {
          const r = ask.replies.find((x) => x.userId === t.id);
          return (
            <li key={t.id} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                  r ? "bg-[var(--st-approved)] text-white" : "border border-line bg-white text-muted"
                }`}
              >
                {r ? <Check size={12} /> : null}
              </span>
              <Avatar photoFileId={t.photoFileId} lastName={t.name} firstName="" size={20} />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              <span className="text-[11px] text-muted">
                {r ? (r.empty ? "пусто" : r.files[0]?.name || r.text || "сдано") : "ждём"}
              </span>
            </li>
          );
        })}
      </ul>
      {mine ? (
        <p className="mt-2 text-xs text-muted">
          Вы ответили{mine.empty ? " пустым" : mine.files.length ? ` · ${mine.files.map((f) => f.name).join(", ")}` : ""}
        </p>
      ) : null}
      {pending ? (
        <div className="mt-3 space-y-2">
          {err ? <p className="text-xs text-bad">{err}</p> : null}
          <label
            className="dropzone flex cursor-pointer flex-col items-center px-3 py-4 text-center text-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (!empty) void onFiles(e.dataTransfer.files);
            }}
          >
            <Paperclip size={16} className="mb-1 text-muted" />
            Перетащите файл или нажмите
            <input
              type="file"
              multiple
              className="sr-only"
              disabled={busy || empty}
              onChange={(e) => {
                void onFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={empty} onChange={(e) => setEmpty(e.target.checked)} />
            Отправить пустым
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Комментарий, если нужно"
            rows={2}
            className="w-full rounded-xl border border-line px-3 py-2 text-sm"
          />
          <Button
            type="button"
            disabled={busy || (!empty && !text.trim())}
            onClick={() => void send([])}
          >
            {empty ? "Отправить пустым" : "Отправить"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function TaskCard({
  chatId,
  task,
  meId,
  onUpdate,
}: {
  chatId: string;
  task: ChatTaskDto;
  meId: string;
  onUpdate: (next: ChatTaskDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const mine = task.authorId === meId || task.assigneeId === meId;
  const due = task.dueAt
    ? new Date(task.dueAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : "";

  async function setStatus(status: string) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/chat/${chatId}/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok && data.task) onUpdate(data.task);
  }

  return (
    <div className="min-w-[220px] max-w-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gold">
        {task.kindLabel || (task.parentTitle ? `Подзадача · ${task.parentTitle}` : "Поручение")}
      </p>
      <p className="font-semibold text-navy">{task.title}</p>
      {task.body ? <p className="mt-1 text-sm text-muted">{task.body}</p> : null}
      <p className="mt-2 text-sm">
        {task.assigneeName}
        {due ? ` · к ${due}` : ""}
      </p>
      {task.linkHref ? (
        <a href={task.linkHref} className="mt-1 block text-xs font-semibold text-gold">
          к задаче · {task.linkLabel}
        </a>
      ) : null}
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
          task.status === "done" ? "bg-[var(--st-approved-bg)] text-[var(--st-approved)]" : "bg-[var(--st-todo-bg)] text-[var(--st-todo)]"
        }`}
      >
        {task.status === "done" ? "Готово" : "Не готово"}
      </span>
      {task.prodTaskId && !task.linkHref ? (
        <a href={`/prod/jobs/${task.prodTaskId}`} className="ml-2 text-xs font-semibold text-gold">
          в производстве
        </a>
      ) : null}
      {mine ? (
        <div className="mt-2">
          {task.status === "done" ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void setStatus("todo")}>
              Вернуть
            </Button>
          ) : (
            <Button type="button" disabled={busy} onClick={() => void setStatus("done")}>
              Готово
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

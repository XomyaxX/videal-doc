"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Textarea } from "@/components/ui";

export type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
};

export function TaskComments({
  taskId,
  canWrite,
  me,
  comments,
}: {
  taskId: string;
  canWrite: boolean;
  me: string;
  comments: TaskComment[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${taskId}/comment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не отправилось");
      return;
    }
    setText("");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {comments.length === 0 ? (
        <p className="text-sm text-muted">Пока нет комментариев.</p>
      ) : (
        <ul className="max-h-72 space-y-2 overflow-auto pr-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className={`rounded-xl px-3 py-2 ${c.authorId === me ? "bg-paper" : "border border-line bg-white"}`}
            >
              <div className="flex justify-between gap-2 text-xs text-muted">
                <span className="font-semibold text-navy">{c.authorName}</span>
                <span>
                  {new Date(c.createdAt).toLocaleString("ru-RU", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form onSubmit={send} className="space-y-2">
          <ErrorText>{error}</ErrorText>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Комментарий к этой задаче"
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (!busy) e.currentTarget.form?.requestSubmit();
            }}
          />
          <p className="text-xs text-muted">Enter — отправить, Shift+Enter — новая строка</p>
          <Button type="submit" disabled={busy || !text.trim()}>
            {busy ? "Отправляем…" : "Оставить комментарий"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">Комментировать могут исполнитель и руководитель.</p>
      )}
    </div>
  );
}

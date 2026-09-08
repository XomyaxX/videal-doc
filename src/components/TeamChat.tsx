"use client";

import { useEffect, useRef, useState } from "react";
import { Button, ErrorText } from "@/components/ui";

type ChatFile = {
  id: string;
  originalName: string;
  preview: "image" | "pdf" | "video" | "none";
  fileUrl: string;
  thumbUrl: string;
};

type Msg = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  files: ChatFile[];
};

function FilePreview({ file }: { file: ChatFile }) {
  if (file.preview === "image" || file.thumbUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <a href={file.fileUrl} target="_blank" rel="noreferrer">
        <img src={file.thumbUrl || file.fileUrl} alt={file.originalName} className="mt-2 max-h-56 rounded-lg object-contain" />
      </a>
    );
  }
  if (file.preview === "video") {
    return (
      <video src={file.fileUrl} controls className="mt-2 max-h-56 w-full rounded-lg bg-black">
        <track kind="captions" />
      </video>
    );
  }
  if (file.preview === "pdf") {
    return <iframe title={file.originalName} src={file.fileUrl} className="mt-2 h-56 w-full rounded-lg bg-white" />;
  }
  return (
    <a href={file.fileUrl} className="mt-2 inline-block text-sm font-semibold text-navy underline">
      {file.originalName}
    </a>
  );
}

export function TeamChat({
  endpoint,
  canWrite,
  me,
  emptyText = "Пока тихо. Напишите, что делать, или киньте референс.",
  lockedText = "Писать могут только участники этой команды.",
  placeholder = "Сообщение команде",
  className = "h-[70vh]",
}: {
  endpoint: string;
  canWrite: boolean;
  me: string;
  emptyText?: string;
  lockedText?: string;
  placeholder?: string;
  className?: string;
}) {
  const [rows, setRows] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function load() {
    const res = await fetch(endpoint);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setRows(data.rows || []);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [rows.length]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => f.size > 0);
    setFiles((prev) => [...prev, ...incoming]);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!body.trim() && files.length === 0) return;
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("body", body);
    for (const f of files) fd.append("files", f, f.name);
    const res = await fetch(endpoint, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не отправилось");
      return;
    }
    setBody("");
    setFiles([]);
    setRows((prev) => [...prev, data]);
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto pr-1">
        {rows.length === 0 ? <p className="text-sm text-muted">{emptyText}</p> : null}
        {rows.map((m) => (
          <div key={m.id} className={`rounded-xl px-3 py-2 ${m.authorId === me ? "bg-paper" : "bg-white border border-line"}`}>
            <div className="flex justify-between gap-2 text-xs text-muted">
              <span className="font-semibold text-navy">{m.authorName}</span>
              <span>
                {new Date(m.createdAt).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            {m.body ? <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p> : null}
            {m.files.map((f) => (
              <FilePreview key={f.id} file={f} />
            ))}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      {canWrite ? (
        <form
          className="mt-3 space-y-2"
          onSubmit={send}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <ErrorText>{error}</ErrorText>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (!busy) e.currentTarget.form?.requestSubmit();
            }}
            placeholder={placeholder}
            className="min-h-[72px] w-full rounded-xl border border-line bg-white px-3 py-2"
          />
          <p className="text-xs text-muted">Enter — отправить, Shift+Enter — новая строка</p>
          <label
            className={`block cursor-pointer rounded-xl border border-dashed px-3 py-2 text-sm ${
              over ? "border-gold bg-paper" : "border-line bg-white text-muted"
            }`}
          >
            Перетащите файлы сюда или выберите — картинки, видео, PDF откроются в чате
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {files.length ? (
            <ul className="text-xs text-muted">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  {f.name}{" "}
                  <button type="button" className="text-bad" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                    убрать
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Отправляем…" : "Отправить"}
          </Button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">{lockedText}</p>
      )}
    </div>
  );
}

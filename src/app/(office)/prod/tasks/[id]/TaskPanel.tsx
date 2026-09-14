"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { APPROVE_DENIED } from "@/lib/prod";

export function TaskPanel({
  id,
  status,
  canLead,
  canApprove,
  people,
  assigneeId,
  helperId,
  diskUnc,
}: {
  id: string;
  status: string;
  canLead: boolean;
  canApprove: boolean;
  people: { id: string; name: string }[];
  assigneeId: string;
  helperId: string;
  diskUnc: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [who, setWho] = useState(assigneeId);
  const [help, setHelp] = useState(helperId);
  const [folder, setFolder] = useState(diskUnc);

  async function act(next: string, extra?: Record<string, string>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next, comment: note, ...extra }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  async function upload(file: File) {
    setBusy(true);
    setError("");
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch(`/api/prod/tasks/${id}/files`, { method: "POST", body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка загрузки");
    else window.location.reload();
  }

  async function saveFolder() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ diskDir: folder }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) setError(data.error || "Ошибка");
    else window.location.reload();
  }

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        {status !== "wip" && (
          <Button disabled={busy} onClick={() => act("wip")}>
            В работу
          </Button>
        )}
        <Button disabled={busy} variant="gold" onClick={() => act("done")}>
          Сдать
        </Button>
        <Button disabled={busy} variant="secondary" onClick={() => act("blocked", { blockedReason: note })}>
          Ждём
        </Button>
        {canLead && canApprove ? (
          <>
            <Button disabled={busy} variant="gold" onClick={() => act("approved")}>
              Утвердить
            </Button>
            <Button disabled={busy} variant="danger" onClick={() => act("revise", { comment: note })}>
              На правки
            </Button>
          </>
        ) : null}
      </div>
      {canLead && !canApprove ? <p className="text-sm text-muted">{APPROVE_DENIED}</p> : null}
      <Field label="Почему ждём / правки" hint="Для кнопок «Ждём» и «На правки». Переписка — в чате задачи справа.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Field
        label="Папка на сетевом диске"
        hint="Вставьте путь как в проводнике. Система отбросит всё до папки Data и сохранит только хвост."
      >
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            placeholder="\\\\Win-ig5p3pa35h3\\d\\Data\\E01\\SC02\\3D"
            spellCheck={false}
            autoComplete="off"
          />
          <Button variant="secondary" disabled={busy} onClick={() => void saveFolder()}>
            Сохранить путь
          </Button>
        </div>
      </Field>
      <Field label="Файл сдачи" hint="mp4, png, jpg, pdf. Нужен, чтобы сдать задачу. Blend — ссылкой на шаре.">
        <input
          type="file"
          accept=".mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.pdf,.gif"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </Field>
      {canLead ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Исполнитель">
            <Select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">не назначен</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Суб-исполнитель" hint="Работает по задаче, баллы остаются главному">
            <Select value={help} onChange={(e) => setHelp(e.target.value)}>
              <option value="">нет</option>
              {people
                .filter((p) => p.id !== who)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => act(status, { assigneeId: who, helperId: help })}
            >
              Назначить
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

type Person = { id: string; name: string; skillNames: string[] };
type Episode = { id: string; code: string; name: string };

export function JobForm({
  people,
  episodes,
  currentEpisodeId,
}: {
  people: Person[];
  episodes: Episode[];
  currentEpisodeId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/prod/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: fd.get("title"),
        description: fd.get("description"),
        episodeId: fd.get("episodeId") || null,
        startsAt: fd.get("startsAt") || null,
        dueAt: fd.get("dueAt") || null,
        memberIds: picked,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Не удалось создать");
    else router.push(`/prod/jobs/${data.id}`);
  }

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-4">
      <ErrorText>{error}</ErrorText>
      <Field label="Название">
        <Input name="title" required placeholder="Персонаж Ксюша, препрод серии 3…" />
      </Field>
      <Field label="Описание">
        <Textarea name="description" placeholder="Что должно получиться, для кого, к какому сроку" />
      </Field>
      <Field label="Серия">
        <Select name="episodeId" defaultValue={currentEpisodeId}>
          <option value="">без серии</option>
          {episodes.map((e) => (
            <option key={e.id} value={e.id}>
              {e.code} · {e.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Начало">
          <Input
            name="startsAt"
            type="date"
            defaultValue={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Omsk" })}
          />
        </Field>
        <Field label="Срок">
          <Input name="dueAt" type="date" />
        </Field>
      </div>
      <Field label="Команда" hint="Потом можно добавить. Автораздача сажает подзадачи только на этих людей.">
        <div className="max-h-72 space-y-1 overflow-auto rounded-xl border border-line bg-white p-2">
          {people.map((p) => (
            <label key={p.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
              <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} className="mt-1" />
              <span>
                <span className="font-semibold text-navy">{p.name}</span>
                {p.skillNames.length ? (
                  <span className="mt-0.5 block text-xs text-muted">{p.skillNames.join(" · ")}</span>
                ) : (
                  <span className="mt-0.5 block text-xs text-muted">скилы не отмечены</span>
                )}
              </span>
            </label>
          ))}
        </div>
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? "Создаём…" : "Создать крупную задачу"}
      </Button>
    </form>
  );
}

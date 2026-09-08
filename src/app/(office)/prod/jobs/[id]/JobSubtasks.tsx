"use client";

import { useState } from "react";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

type Skill = { id: string; code: string; name: string };
type Person = { id: string; name: string; skillNames: string[] };

export function JobSubtasks({
  jobId,
  skills,
  people,
  canLead,
}: {
  jobId: string;
  skills: Skill[];
  people: Person[];
  canLead: boolean;
}) {
  const [title, setTitle] = useState("");
  const [complexity, setComplexity] = useState(3);
  const [dueAt, setDueAt] = useState("");
  const [comment, setComment] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [assignMsg, setAssignMsg] = useState("");

  function toggle(id: string) {
    setSkillIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/jobs/${jobId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, complexity, skillIds, dueAt: dueAt || null, comment, assigneeId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось добавить");
      return;
    }
    window.location.reload();
  }

  async function assign() {
    setBusy(true);
    setError("");
    setAssignMsg("");
    const res = await fetch(`/api/prod/jobs/${jobId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "assign" }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось распределить");
      return;
    }
    const placed = (data.placed || []).length;
    const skipped = (data.skipped || []).length;
    setAssignMsg(`Назначено ${placed}${skipped ? `, без исполнителя ${skipped}` : ""}`);
    window.location.reload();
  }

  if (!canLead) return null;

  return (
    <div className="space-y-4">
      <ErrorText>{error}</ErrorText>
      {assignMsg ? <p className="text-sm text-ok">{assignMsg}</p> : null}
      <Button type="button" disabled={busy} onClick={assign}>
        Распределить по скилам
      </Button>
      <form onSubmit={add} className="space-y-3 rounded-xl border border-line bg-white p-3">
        <p className="font-semibold text-navy">Новая подзадача</p>
        <Field label="Название">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Скульпт головы, раскадровка сцены 2…" />
        </Field>
        <Field label="Сложность">
          <input
            type="range"
            min={1}
            max={5}
            value={complexity}
            onChange={(e) => setComplexity(Number(e.target.value))}
            className="w-full"
          />
          <span className="text-sm text-muted">{complexity} из 5</span>
        </Field>
        <Field label="Исполнитель" hint="Оставьте пустым — назначит «Распределить по скилам»">
          <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">не назначен</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.skillNames.length ? ` · ${p.skillNames.join(", ")}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Скилы" hint="По ним система выберет исполнителя из команды, если человека не указали">
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <label
                key={s.id}
                className={`cursor-pointer rounded-xl border px-2 py-1 text-sm ${
                  skillIds.includes(s.id) ? "border-gold bg-paper font-semibold text-navy" : "border-line bg-white"
                }`}
              >
                <input type="checkbox" className="sr-only" checked={skillIds.includes(s.id)} onChange={() => toggle(s.id)} />
                {s.name}
              </label>
            ))}
          </div>
        </Field>
        <Field label="Срок">
          <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </Field>
        <Field label="Комментарий">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy}>
          Добавить подзадачу
        </Button>
      </form>
    </div>
  );
}

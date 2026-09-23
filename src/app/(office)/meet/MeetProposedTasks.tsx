"use client";

import { useEffect, useState } from "react";
import { Button, ErrorText, Select } from "@/components/ui";

type Item = {
  i: number;
  title: string;
  brief: string;
  ownerHint: string;
  due: string;
  assigneeId: string;
  assigneeName: string;
  candidates: { id: string; name: string }[];
};

export function MeetProposedTasks({ meetingId, canLead }: { meetingId: string; canLead: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [seeded, setSeeded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    void fetch(`/api/meet/${meetingId}/summary/tasks`)
      .then((r) => r.json())
      .then((d) => {
        setItems(d.items || []);
        setPeople(d.people || []);
        setSeeded(d.seeded || []);
      });
  }, [meetingId]);

  if (!items.length && !seeded.length) {
    return (
      <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-3">
        <h3 className="font-serif text-lg text-navy">Предложить в производство</h3>
        <p className="mt-2 text-sm text-muted">Явных поручений в разговоре не назвали. Задачи сами не создаём — только если руководитель добавит их вручную в производстве.</p>
      </div>
    );
  }

  async function create() {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/meet/${meetingId}/summary/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((x) => ({ title: x.title, brief: x.brief, assigneeId: x.assigneeId, due: x.due })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setErr(data.error || "Не создалось");
    else setSeeded(data.ids || ["ok"]);
  }

  return (
    <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-3">
      <h3 className="font-serif text-lg text-navy">Предложить в производство</h3>
      {seeded.length ? (
        <p className="mt-2 text-sm text-muted">Уже создано задач: {seeded.length}. Откройте «Мои задачи» / производство.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((it, idx) => (
            <li key={it.i} className="rounded-xl border border-line p-3">
              <p className="font-semibold text-navy">{it.title}</p>
              {it.brief && it.brief !== it.title ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{it.brief}</p> : null}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Select
                  value={it.assigneeId}
                  onChange={(e) =>
                    setItems((prev) => prev.map((x, j) => (j === idx ? { ...x, assigneeId: e.target.value } : x)))
                  }
                >
                  <option value="">без исполнителя</option>
                  {(it.candidates.length ? it.candidates : people).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                {it.ownerHint ? <span className="text-xs text-muted">из сводки: {it.ownerHint}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ErrorText>{err}</ErrorText>
      {canLead && !seeded.length && items.length ? (
        <Button className="mt-3" disabled={busy} onClick={() => void create()}>
          Создать задачи
        </Button>
      ) : null}
    </div>
  );
}

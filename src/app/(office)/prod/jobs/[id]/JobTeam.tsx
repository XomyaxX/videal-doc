"use client";

import { useState } from "react";
import { Button, ErrorText } from "@/components/ui";

type Person = { id: string; name: string; skillNames: string[] };

export function JobTeam({
  jobId,
  people,
  selected,
  canLead,
}: {
  jobId: string;
  people: Person[];
  selected: string[];
  canLead: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(selected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  async function save() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/jobs/${jobId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds: picked }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setError(data.error || "Не удалось сохранить");
    else window.location.reload();
  }

  if (!canLead) return null;

  return (
    <div className="space-y-2">
      <Button type="button" variant="secondary" className="px-3 py-1.5 text-sm" onClick={() => setOpen((v) => !v)}>
        {open ? "Закрыть" : "Изменить команду"}
      </Button>
      {open ? (
        <div className="space-y-2 rounded-xl border border-line bg-white p-3">
          <ErrorText>{error}</ErrorText>
          <div className="max-h-56 space-y-1 overflow-auto">
            {people.map((p) => (
              <label key={p.id} className="flex items-start gap-2 rounded-lg px-2 py-1 hover:bg-paper">
                <input
                  type="checkbox"
                  checked={picked.includes(p.id)}
                  onChange={() =>
                    setPicked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]))
                  }
                  className="mt-1"
                />
                <span>
                  <span className="text-sm font-semibold text-navy">{p.name}</span>
                  {p.skillNames.length ? <span className="block text-xs text-muted">{p.skillNames.join(" · ")}</span> : null}
                </span>
              </label>
            ))}
          </div>
          <Button type="button" disabled={busy} onClick={save}>
            Сохранить команду
          </Button>
        </div>
      ) : null}
    </div>
  );
}

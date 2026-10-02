"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

type DutyPerson = { id: string; name: string; lastName: string; firstName: string; photoFileId: string };
type DutyOverrides = Record<string, { clean?: string[]; trash?: string }>;

function PersonPick({
  value,
  people,
  disabled,
  onChange,
}: {
  value: string;
  people: DutyPerson[];
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-full rounded-lg border border-line bg-white px-2 py-1 text-sm text-navy outline-none focus:border-gold disabled:bg-transparent disabled:px-0 disabled:py-0 disabled:border-0"
    >
      <option value="">—</option>
      {people.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

export function DutyEditor({
  canEdit,
  today,
  men,
  women,
  overrides,
  trashDays,
  cleanDays,
}: {
  canEdit: boolean;
  today: string;
  men: DutyPerson[];
  women: DutyPerson[];
  overrides: DutyOverrides;
  trashDays: { ymd: string; label: string; person: DutyPerson | null }[];
  cleanDays: { ymd: string; label: string; people: DutyPerson[] }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function save(ymd: string, kind: "trash" | "clean", ids: string[]) {
    const key = `${kind}:${ymd}`;
    setBusy(key);
    setError("");
    const res = await fetch("/api/duty/override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ymd, kind, ids }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      {error ? <p className="md:col-span-2 text-sm text-bad">{error}</p> : null}
      <section className="scroll-mt-6 rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-navy">Вынос мусора · 20 рабочих дней</h2>
          <Button href="/api/duty/pdf?kind=trash" variant="ghost">
            PDF
          </Button>
        </div>
        {canEdit ? <p className="mt-1 text-xs text-muted">Выберите фамилию — подмена только на этот день.</p> : null}
        <table className="mt-3 w-full text-sm">
          <tbody>
            {trashDays.map((d) => {
              const over = Boolean(overrides[d.ymd]?.trash);
              return (
                <tr key={d.ymd} className={d.ymd === today ? "font-semibold text-navy" : ""}>
                  <td className="py-1.5 whitespace-nowrap pr-3">{d.label}</td>
                  <td>
                    {canEdit ? (
                      <PersonPick
                        value={d.person?.id || ""}
                        people={men}
                        disabled={busy === `trash:${d.ymd}`}
                        onChange={(id) => void save(d.ymd, "trash", id ? [id] : [])}
                      />
                    ) : (
                      d.person?.name || "—"
                    )}
                    {over ? <span className="ml-2 text-[11px] font-semibold text-gold">подмена</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <section className="scroll-mt-6 rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-navy">Уборка · вт и пт</h2>
          <Button href="/api/duty/pdf?kind=clean" variant="ghost">
            PDF
          </Button>
        </div>
        {canEdit ? <p className="mt-1 text-xs text-muted">Двое на день. Пустой слот — убрать из пары.</p> : null}
        <table className="mt-3 w-full text-sm">
          <tbody>
            {cleanDays.map((d) => {
              const over = Boolean(overrides[d.ymd]?.clean?.length);
              const a = d.people[0]?.id || "";
              const b = d.people[1]?.id || "";
              return (
                <tr key={d.ymd} className={d.ymd === today ? "font-semibold text-navy" : ""}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.label}</td>
                  <td>
                    {canEdit ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <PersonPick
                          value={a}
                          people={women}
                          disabled={busy === `clean:${d.ymd}`}
                          onChange={(id) => void save(d.ymd, "clean", [id, b].filter(Boolean))}
                        />
                        <span className="text-muted">·</span>
                        <PersonPick
                          value={b}
                          people={women}
                          disabled={busy === `clean:${d.ymd}`}
                          onChange={(id) => void save(d.ymd, "clean", [a, id].filter(Boolean))}
                        />
                      </span>
                    ) : (
                      d.people.map((p) => p.name).join(" · ") || "—"
                    )}
                    {over ? <span className="ml-2 text-[11px] font-semibold text-gold">подмена</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

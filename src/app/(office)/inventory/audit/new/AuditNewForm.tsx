"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Select } from "@/components/ui";

type Person = { id: string; name: string };
type OpenPerson = Person & { auditId: string };

export function AuditNewForm({
  people,
  round = null,
}: {
  people: Person[];
  round?: {
    number: string;
    checked: number;
    total: number;
    pending: Person[];
    inProgress: OpenPerson[];
    done: OpenPerson[];
  } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const choices = round ? round.pending : people;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/inventory/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: String(fd.get("userId") || "") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не создалось");
      setBusy(false);
      return;
    }
    router.push(`/inventory/audit/${data.id}`);
  }

  return (
    <div className="space-y-4">
      {round ? (
        <Card>
          <div className="font-semibold text-navy">Тур {round.number}</div>
          <p className="mt-1 text-sm text-muted">
            Проверено {round.checked} из {round.total}. Уволенные в список не попадают.
          </p>
        </Card>
      ) : null}
      {round && round.inProgress.length ? (
        <Card>
          <h2 className="font-semibold text-navy">В процессе</h2>
          <ul className="mt-3 divide-y divide-line">
            {round.inProgress.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-navy">
                  {p.name} <span className="text-sm font-semibold text-gold">идёт</span>
                </span>
                <Button href={`/inventory/audit/${p.auditId}`} variant="secondary">
                  Продолжить
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {choices.length ? (
        <form onSubmit={(e) => void submit(e)}>
          <Card>
            <Field label="Сотрудник, у которого считаем ТМЦ">
              <Select name="userId" required>
                <option value="">— выберите —</option>
                {choices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>
          <ErrorText>{err}</ErrorText>
          <div className="mt-4 flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? "Открываем…" : "Начать обход"}
            </Button>
            <Button type="button" variant="secondary" href="/inventory">
              Отмена
            </Button>
          </div>
        </form>
      ) : (
        <Card>
          <p className="text-sm text-muted">
            {round && round.total > 0
              ? "Все действующие сотрудники в этом туре уже отмечены."
              : "Нет действующих сотрудников."}
          </p>
          <div className="mt-3">
            <Button href="/inventory" variant="secondary">
              К инвентарю
            </Button>
          </div>
        </Card>
      )}
      {round && round.done.length ? (
        <details className="rounded-2xl border border-line bg-card px-5 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-navy">
            Уже проверены ({round.done.length})
          </summary>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {round.done.map((p) => (
              <li key={p.id}>
                <Link href={`/inventory/audit/${p.auditId}`} className="hover:text-gold">
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Pill } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export type ReportFund = {
  id: string;
  number: string;
  purpose: string;
  amount: number;
  due: string;
};

export function ReportFundsPicker({ funds }: { funds: ReportFund[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const groups = useMemo(() => {
    const map = new Map<string, ReportFund[]>();
    for (const f of funds) {
      const key = f.purpose.trim() || "Без направления";
      const list = map.get(key) || [];
      list.push(f);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [funds]);
  const mixed = useMemo(() => {
    const purposes = new Set(
      funds.filter((f) => selected.includes(f.id)).map((f) => f.purpose.trim() || "Без направления"),
    );
    return purposes.size > 1;
  }, [funds, selected]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function toggleGroup(ids: string[]) {
    setSelected((prev) => {
      const allOn = ids.every((id) => prev.includes(id));
      if (allOn) return prev.filter((id) => !ids.includes(id));
      return Array.from(new Set([...prev, ...ids]));
    });
  }

  return (
    <div>
      <p className="mt-1 text-sm text-muted">
        Отметьте запросы одного направления. Разные цели лучше сдать отдельными авансовыми.
      </p>
      <div className="mt-3 space-y-4">
        {groups.map(([purpose, rows]) => {
          const ids = rows.map((r) => r.id);
          const allOn = ids.every((id) => selected.includes(id));
          return (
            <div key={purpose}>
              <button
                type="button"
                onClick={() => toggleGroup(ids)}
                className="mb-1 text-left text-sm font-semibold text-navy hover:text-gold"
              >
                {purpose}
                <span className="ml-2 font-normal text-muted">
                  {allOn ? "снять все" : `выбрать все · ${rows.length}`}
                </span>
              </button>
              <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                {rows.map((f) => {
                  const on = selected.includes(f.id);
                  return (
                    <li key={f.id}>
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-paper">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={on}
                          onChange={() => toggle(f.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{f.number}</span>
                          <span className="mt-0.5 block text-sm text-muted">
                            {formatMoney(f.amount)} · до {f.due}
                          </span>
                        </span>
                        <Link
                          href={`/funds/${f.id}`}
                          className="shrink-0 text-xs text-gold underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          карточка
                        </Link>
                        <Pill tone={on ? "ok" : "wait"}>{on ? "в отчёт" : "отчёт"}</Pill>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      {mixed ? (
        <p className="mt-3 text-sm text-wait">
          Выбраны разные направления — в одном АО-1 лучше оставить одно.
        </p>
      ) : null}
      <Button
        className="mt-4"
        disabled={selected.length === 0}
        onClick={() => {
          window.location.href = `/advances/new?funds=${selected.join(",")}`;
        }}
      >
        {selected.length === 0
          ? "Выберите запросы"
          : `Составить авансовый из выбранных (${selected.length})`}
      </Button>
    </div>
  );
}

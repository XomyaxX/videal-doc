"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { APPROVE_DENIED, STATUS_LABEL } from "@/lib/prod";

export type BoardCol = { id: string; stripe: string; well: string };
export type BoardCard = {
  id: string;
  status: string;
  stageLabel: string;
  kindLabel: string;
  title: string;
  assignee: string;
  canApprove: boolean;
  due: string;
};

export function BoardKanban({
  columns,
  initial,
  canLead,
}: {
  columns: BoardCol[];
  initial: BoardCard[];
  canLead: boolean;
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dragId = useRef("");
  const dragged = useRef(false);

  async function dropOn(status: string) {
    const id = dragId.current;
    dragId.current = "";
    setOver("");
    const card = cards.find((c) => c.id === id);
    if (!id || !card || card.status === status || busy) return;
    if ((status === "approved" || status === "revise") && !card.canApprove) {
      setError(APPROVE_DENIED);
      return;
    }
    const prev = cards;
    setCards((list) => list.map((c) => (c.id === id ? { ...c, status } : c)));
    setBusy(true);
    setError("");
    const res = await fetch(`/api/prod/tasks/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setCards(prev);
      setError(data.error || "Не удалось перенести");
      return;
    }
    router.refresh();
  }

  const gridCls = columns.length > 6 ? "lg:grid-cols-7" : "lg:grid-cols-6";

  return (
    <div>
      {canLead ? (
        <p className="mb-3 px-4 text-sm text-muted md:px-6">
          Перетащите карточку в другую колонку, чтобы сменить статус.
        </p>
      ) : null}
      {error ? <p className="mb-3 px-4 text-sm text-bad md:px-6">{error}</p> : null}
      <div className={`flex flex-col gap-4 px-4 md:px-6 lg:grid lg:items-stretch lg:gap-3 ${gridCls}`}>
        {columns.map((col) => {
          const rows = cards.filter((c) => c.status === col.id);
          return (
            <section
              key={col.id}
              onDragOver={(e) => {
                if (!canLead) return;
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((v) => (v === col.id ? "" : v))}
              onDrop={(e) => {
                e.preventDefault();
                void dropOn(col.id);
              }}
              className={`flex min-h-[220px] flex-col overflow-hidden rounded-2xl border ${
                over === col.id ? "border-gold" : "border-line"
              } ${col.well}`}
            >
              <header className="flex items-center gap-2 px-3 py-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${col.stripe}`} />
                <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-navy">{STATUS_LABEL[col.id]}</h2>
                <span className="text-xs tabular-nums text-muted">{rows.length}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2 p-2 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto">
                {rows.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-muted">пусто</p>
                ) : (
                  rows.map((t) => (
                    <Link
                      key={t.id}
                      href={`/prod/tasks/${t.id}`}
                      draggable={canLead}
                      onDragStart={(e) => {
                        dragId.current = t.id;
                        dragged.current = false;
                        e.dataTransfer.setData("text/plain", t.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDrag={() => {
                        dragged.current = true;
                      }}
                      onClick={(e) => {
                        if (dragged.current) e.preventDefault();
                        dragged.current = false;
                      }}
                      className={`flex gap-2 rounded-xl border border-line bg-card p-2.5 shadow-[var(--shadow)] hover:border-gold ${
                        canLead ? "cursor-grab active:cursor-grabbing" : ""
                      }`}
                    >
                      <span className={`w-1 shrink-0 rounded-full ${col.stripe}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] text-muted">
                          {t.kindLabel ? `${t.kindLabel} · ` : ""}
                          {t.stageLabel}
                        </span>
                        <span className="mt-0.5 block text-sm font-medium leading-snug text-navy">{t.title}</span>
                        <span className="mt-1 block truncate text-[11px] text-muted">
                          {t.assignee}
                          {t.due ? ` · ${t.due}` : ""}
                        </span>
                      </span>
                    </Link>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

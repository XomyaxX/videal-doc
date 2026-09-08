"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { officeYmd } from "@/lib/dates";
import { STAGE_BAR } from "@/lib/prod";

type Person = { id: string; lastName: string; firstName: string; middleName: string };
type Dept = { id: string; name: string };
type Overlay = { ymd: string; label: string; href: string; tone: "gold" | "ok" | "wait" | "navy" };
type ProdBar = {
  id: string;
  title: string;
  href: string;
  startYmd: string;
  endYmd: string;
  stage: string;
  status: string;
};

type EventRow = {
  id: string;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: string;
  authorId: string;
  author: Person;
  participants: { userId: string; user: Person }[];
};

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];
const COLORS = [
  ["navy", "Синий"],
  ["gold", "Золотой"],
  ["ok", "Зелёный"],
  ["wait", "Жёлтый"],
];

const ymdOf = officeYmd;

function personName(p: Person) {
  return `${p.lastName} ${p.firstName} ${p.middleName || ""}`.trim();
}

function eventYmds(ev: EventRow) {
  const out: string[] = [];
  const start = new Date(ev.startsAt);
  const end = new Date(ev.endsAt);
  const cur = new Date(`${ymdOf(start)}T12:00:00+06:00`);
  const last = new Date(`${ymdOf(end)}T12:00:00+06:00`);
  while (cur.getTime() <= last.getTime() + 3600_000) {
    out.push(ymdOf(cur));
    cur.setDate(cur.getDate() + 1);
    if (out.length > 60) break;
  }
  return out;
}

function spanInWeek(week: (string | null)[], start: string, end: string) {
  let from = -1;
  let to = -1;
  week.forEach((ymd, i) => {
    if (!ymd) return;
    if (ymd >= start && ymd <= end) {
      if (from === -1) from = i;
      to = i;
    }
  });
  if (from === -1) return null;
  return { col: from, span: to - from + 1 };
}

export function CalendarBoard({
  people,
  departments,
  meId,
  overlays,
  canLead = false,
}: {
  people: Person[];
  departments: Dept[];
  meId: string;
  overlays: Overlay[];
  canLead?: boolean;
}) {
  const now = new Date();
  const [year, setYear] = useState(Number(ymdOf(now).slice(0, 4)));
  const [month, setMonth] = useState(Number(ymdOf(now).slice(5, 7)) - 1);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [bars, setBars] = useState<ProdBar[]>([]);
  const [scope, setScope] = useState<"mine" | "dept" | "all">("mine");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(ymdOf(now));
  const [who, setWho] = useState<"me" | "dept" | "list">("me");
  const [selected, setSelected] = useState<string[]>([]);
  const today = ymdOf(now);

  async function load() {
    const from = new Date(year, month, 1);
    const to = new Date(year, month + 1, 0, 23, 59, 59);
    const res = await fetch(`/api/calendar?from=${from.toISOString()}&to=${to.toISOString()}`);
    const data = await res.json();
    if (res.ok) setEvents(data.events || []);
    const pr = await fetch(
      `/api/prod/calendar?from=${from.toISOString()}&to=${to.toISOString()}&scope=${canLead ? scope : "mine"}`,
    );
    const pd = await pr.json();
    if (pr.ok) setBars(pd.bars || []);
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, scope]);

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDow = (first.getDay() + 6) % 7;
    const daysIn = new Date(year, month + 1, 0).getDate();
    const list: (string | null)[] = [];
    for (let i = 0; i < startDow; i++) list.push(null);
    for (let d = 1; d <= daysIn; d++) {
      const mm = String(month + 1).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      list.push(`${year}-${mm}-${dd}`);
    }
    while (list.length % 7) list.push(null);
    return list;
  }, [year, month]);

  function shift(delta: number) {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const allDay = fd.get("allDay") === "on";
    const start = String(fd.get("startsAt") || "");
    const end = String(fd.get("endsAt") || start);
    const startDay = start.slice(0, 10);
    const endDay = (end || start).slice(0, 10);
    if (startDay && startDay < today) {
      setBusy(false);
      setError("Нельзя поставить событие на прошедшую дату");
      return;
    }
    const body = {
      title: fd.get("title"),
      body: fd.get("body"),
      allDay,
      color: fd.get("color"),
      startsAt: allDay ? `${startDay}T00:00:00` : start,
      endsAt: allDay ? `${endDay}T23:59:00` : end || start,
      departmentId: who === "dept" ? fd.get("departmentId") : "",
      participantIds: who === "list" ? selected : who === "me" ? [meId] : [],
    };
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось создать");
      return;
    }
    setOpen(false);
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Удалить событие?")) return;
    await fetch(`/api/calendar/${id}`, { method: "DELETE" });
    await load();
  }

  function itemsFor(ymd: string) {
    const evs = events.filter((ev) => eventYmds(ev).includes(ymd));
    const extra = overlays.filter((o) => o.ymd === ymd);
    return { evs, extra };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" type="button" onClick={() => shift(-1)}>
            ←
          </Button>
          <h2 className="min-w-[180px] text-center font-serif text-2xl capitalize text-navy">
            {MONTHS[month]} {year}
          </h2>
          <Button variant="secondary" type="button" onClick={() => shift(1)}>
            →
          </Button>
          <Button variant="ghost" type="button" onClick={() => {
            const t = ymdOf(new Date());
            setYear(Number(t.slice(0, 4)));
            setMonth(Number(t.slice(5, 7)) - 1);
          }}>
            Сегодня
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canLead ? (
            <div className="flex rounded-xl border border-line bg-white p-0.5 text-sm">
              {(["mine", "dept", "all"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={`rounded-lg px-2.5 py-1.5 font-semibold ${scope === s ? "bg-navy !text-white" : ""}`}
                >
                  {s === "mine" ? "Мои шоты" : s === "dept" ? "Отдел" : "Все"}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            type="button"
            onClick={() => {
              setPicked(today);
              setOpen(true);
            }}
          >
            Новое событие
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold uppercase tracking-wide text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {Array.from({ length: cells.length / 7 }, (_, w) => {
          const week = cells.slice(w * 7, w * 7 + 7);
          const weekBars = bars
            .map((b) => {
              const sp = spanInWeek(week, b.startYmd, b.endYmd);
              return sp ? { b, ...sp } : null;
            })
            .filter((x): x is { b: ProdBar; col: number; span: number } => Boolean(x));
          const lanes: number[] = [];
          const placed = weekBars.map((item) => {
            let lane = 0;
            while (lanes[lane] !== undefined && lanes[lane] >= item.col) lane += 1;
            lanes[lane] = item.col + item.span - 1;
            return { ...item, lane };
          });
          const laneCount = Math.max(1, placed.reduce((m, p) => Math.max(m, p.lane + 1), 0));
          return (
            <div key={`w${w}`} className="relative">
              <div className="grid grid-cols-7 gap-1">
                {week.map((ymd, i) => {
                  if (!ymd) return <div key={`e${w}-${i}`} className="min-h-[118px] rounded-xl bg-white/40" />;
                  const { evs, extra } = itemsFor(ymd);
                  const isToday = ymd === today;
                  const isPast = ymd < today;
                  return (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => {
                        setPicked(ymd);
                        setOpen(true);
                      }}
                      className={`min-h-[118px] rounded-xl border p-2 text-left ${
                        isToday ? "border-gold bg-white" : isPast ? "border-line bg-white/50 text-muted" : "border-line bg-card"
                      }`}
                    >
                      <div className={`text-sm font-semibold ${isToday ? "text-gold" : "text-navy"}`}>
                        {Number(ymd.slice(8))}
                      </div>
                      <div className="mt-1 space-y-1" style={{ paddingTop: placed.length ? 6 + laneCount * 18 : 0 }}>
                        {evs.slice(0, 2).map((ev) => (
                          <div
                            key={ev.id}
                            className={`truncate rounded-md px-1.5 py-0.5 text-[11px] text-white ${
                              ev.color === "gold"
                                ? "bg-gold"
                                : ev.color === "ok"
                                  ? "bg-ok"
                                  : ev.color === "wait"
                                    ? "bg-wait"
                                    : "bg-navy"
                            }`}
                          >
                            {ev.title}
                          </div>
                        ))}
                        {extra.slice(0, 2).map((o) => (
                          <div
                            key={o.href + o.label}
                            className={`truncate rounded-md px-1.5 py-0.5 text-[11px] ${
                              o.tone === "ok"
                                ? "bg-ok/15 text-ok"
                                : o.tone === "wait"
                                  ? "bg-wait/15 text-wait"
                                  : o.tone === "gold"
                                    ? "bg-gold/15 text-gold"
                                    : "bg-navy/10 text-navy"
                            }`}
                          >
                            {o.label}
                          </div>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
              {placed.length > 0 ? (
                <div className="pointer-events-none absolute inset-x-0 top-7 px-0.5">
                  {placed.map((p) => (
                    <a
                      key={p.b.id}
                      href={p.b.href}
                      title={p.b.title}
                      onClick={(e) => e.stopPropagation()}
                      className={`pointer-events-auto absolute h-[16px] truncate rounded-full px-2 text-[10px] font-semibold leading-[16px] text-white ${
                        STAGE_BAR[p.b.stage] || "bg-navy"
                      } ${p.b.status === "revise" ? "ring-2 ring-bad" : ""} ${p.b.status === "blocked" ? "opacity-70" : ""}`}
                      style={{
                        top: p.lane * 18,
                        left: `calc(${(p.col / 7) * 100}% + 4px)`,
                        width: `calc(${(p.span / 7) * 100}% - 8px)`,
                      }}
                    >
                      {p.b.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {open ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">Событие на {picked}</h2>
          <ErrorText>{error}</ErrorText>
          {picked < today ? (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="text-sm text-muted">На прошедшую дату планировать нельзя — только просмотр.</p>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Закрыть
              </Button>
            </div>
          ) : (
          <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Название">
              <Input name="title" required placeholder="Планерка, съёмка, встреча…" />
            </Field>
            <Field label="Цвет">
              <Select name="color" defaultValue="navy">
                {COLORS.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="allDay" defaultChecked /> Весь день
            </label>
            <Field label="Начало">
              <Input name="startsAt" type="datetime-local" min={`${today}T00:00`} defaultValue={`${picked}T09:00`} />
            </Field>
            <Field label="Конец">
              <Input name="endsAt" type="datetime-local" min={`${today}T00:00`} defaultValue={`${picked}T10:00`} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Описание">
                <Textarea name="body" placeholder="Что планируем" />
              </Field>
            </div>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-semibold text-navy">Участники</p>
              <div className="mb-2 flex flex-wrap gap-2">
                {(
                  [
                    ["me", "Только я"],
                    ["dept", "Отдел"],
                    ["list", "Выбрать людей"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setWho(id)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${who === id ? "bg-navy !text-white" : "border border-line bg-white text-navy"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {who === "dept" ? (
                <Select name="departmentId">
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              ) : null}
              {who === "list" ? (
                <div className="max-h-48 overflow-auto rounded-xl border border-line bg-white p-2">
                  {people.map((p) => {
                    const on = selected.includes(p.id);
                    return (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-paper">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setSelected((prev) => (on ? prev.filter((x) => x !== p.id) : [...prev, p.id]))}
                        />
                        {personName(p)}
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={busy}>
                {busy ? "Сохраняем…" : "Создать"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Закрыть
              </Button>
            </div>
          </form>
          )}
          {itemsFor(picked).evs.length > 0 ? (
            <ul className="mt-4 divide-y divide-line">
              {itemsFor(picked).evs.map((ev) => (
                <li key={ev.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <div className="font-semibold">{ev.title}</div>
                    <div className="text-sm text-muted">
                      {ev.allDay ? "весь день" : new Date(ev.startsAt).toLocaleString("ru-RU", { timeZone: "Asia/Omsk" })}
                      {ev.body ? ` · ${ev.body}` : ""}
                    </div>
                    <div className="text-xs text-muted">
                      {ev.participants.map((p) => personName(p.user)).join(", ")}
                    </div>
                  </div>
                  {ev.authorId === meId ? (
                    <Button type="button" variant="danger" onClick={() => remove(ev.id)}>
                      Удалить
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {itemsFor(picked).extra.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {itemsFor(picked).extra.map((o) => (
                <li key={o.href + o.label}>
                  <a className="text-gold underline" href={o.href}>
                    {o.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}

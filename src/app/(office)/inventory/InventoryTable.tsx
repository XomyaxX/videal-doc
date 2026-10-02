"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Pill } from "@/components/ui";
import { fullName } from "@/lib/names";

type Person = {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string;
  login: string;
  role?: { code: string; name: string } | null;
};
type Row = {
  id: string;
  invNo: string;
  name: string;
  qty: number;
  userId: string | null;
  holderName: string;
  pcHost: string;
  pcCpu: string;
  pcGpu: string;
  pcRam: string;
  pcDisk: string;
  pcMb: string;
  note: string;
  status: string;
  user: Person | null;
};

const empty: Omit<Row, "id" | "user"> = {
  invNo: "",
  name: "",
  qty: 1,
  userId: null,
  holderName: "",
  pcHost: "",
  pcCpu: "",
  pcGpu: "",
  pcRam: "",
  pcDisk: "",
  pcMb: "",
  note: "",
  status: "ok",
};

function who(r: Row) {
  if (isAho(r)) {
    return r.user ? `АХО · ${fullName(r.user)}` : "АХО";
  }
  if (r.user) return fullName(r.user);
  if (r.holderName) return r.holderName;
  return "место пустует";
}

function isAho(r: Row) {
  if (r.user?.role?.code === "aho") return true;
  return r.holderName.trim().toLocaleLowerCase("ru") === "ахо";
}

function matchesQuery(r: Row, s: string) {
  if (!s) return true;
  return `${r.invNo} ${r.name} ${who(r)} ${r.pcHost} ${r.pcCpu} ${r.pcGpu} ${r.note}`
    .toLocaleLowerCase("ru")
    .includes(s);
}

type SortKey = "invNo" | "name" | "who" | "pc";
type SortDir = "asc" | "desc";

function sortValue(r: Row, key: SortKey) {
  if (key === "invNo") return r.invNo || "";
  if (key === "name") return r.name || "";
  if (key === "who") return who(r);
  return r.pcHost || "";
}

function compareRows(a: Row, b: Row, key: SortKey, dir: SortDir) {
  const cmp = sortValue(a, key).localeCompare(sortValue(b, key), "ru", { numeric: true, sensitivity: "base" });
  if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
  return a.id.localeCompare(b.id);
}

function SortTh({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 select-none ${active ? "text-navy" : "hover:text-navy"}`}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <span className="font-mono text-xs" aria-hidden>
          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function InventoryTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [manage, setManage] = useState(false);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("invNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [edit, setEdit] = useState<(typeof empty & { id?: string }) | null>(null);
  const [msg, setMsg] = useState("");
  const [saveError, setSaveError] = useState("");

  function openEdit(row: typeof empty & { id?: string }) {
    setSaveError("");
    setEdit(row);
  }

  async function load() {
    const res = await fetch("/api/inventory");
    const data = await res.json();
    setRows(data.rows || []);
    setPeople(data.people || []);
    setManage(Boolean(data.manage));
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!edit) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setEdit(null);
        setSaveError("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [edit]);

  const questioned = useMemo(() => rows.filter((r) => r.status === "question"), [rows]);

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("ru");
    return rows.filter((r) => matchesQuery(r, s)).sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, q, sortKey, sortDir]);

  function clickSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  async function save() {
    if (!edit) return;
    setSaveError("");
    const body = { ...edit, userId: edit.userId || null };
    const res = await fetch(edit.id ? `/api/inventory/${edit.id}` : "/api/inventory", {
      method: edit.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setSaveError("Не удалось сохранить");
      return;
    }
    setEdit(null);
    setMsg("Сохранено");
    void load();
  }

  async function resolve(id: string, status: "ok" | "question") {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    await fetch(`/api/inventory/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...r, status }),
    });
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Убрать позицию из инвентаря?")) return;
    await fetch(`/api/inventory/${id}`, { method: "DELETE" });
    void load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: фамилия, инв. №, ПК…" />
        {manage ? (
          <>
            <Button href="/api/inventory/xlsx">Скачать Excel</Button>
            <Button variant="secondary" onClick={() => openEdit({ ...empty })}>
              Добавить
            </Button>
          </>
        ) : null}
      </div>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      {manage && questioned.length ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">На обработке · под вопросом</h2>
          <p className="mt-1 text-sm text-muted">Не нашли при обходе. Можно вернуть в учёт, перезакрепить или списать.</p>
          <ul className="mt-3 divide-y divide-line">
            {questioned.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-semibold text-navy">
                    {r.invNo ? `${r.invNo} · ` : ""}
                    {r.name}
                  </div>
                  <div className="text-xs text-muted">
                    {who(r)}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <span className="flex flex-wrap gap-1">
                  <Button variant="secondary" onClick={() => void resolve(r.id, "ok")}>
                    Нашли
                  </Button>
                  <Button variant="ghost" onClick={() => openEdit({ ...r })}>
                    Передать
                  </Button>
                  <Button variant="ghost" onClick={() => void remove(r.id)}>
                    Списать
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {edit && manage ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 bg-navy/50"
            aria-label="Закрыть"
            onClick={() => {
              setEdit(null);
              setSaveError("");
            }}
          />
          <Card className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-2xl">
            <h2 className="font-serif text-xl text-navy">{edit.id ? "Изменить позицию" : "Добавить позицию"}</h2>
            {edit.id ? (
              <p className="mt-1 text-sm text-muted">
                {edit.invNo ? `${edit.invNo} · ` : ""}
                {edit.name || "без названия"}
              </p>
            ) : null}
            {saveError ? <p className="mt-2 text-sm text-bad">{saveError}</p> : null}
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <Input placeholder="Инв. №" value={edit.invNo} onChange={(e) => setEdit({ ...edit, invNo: e.target.value })} />
              <Input
                placeholder="Наименование"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
              <Input
                placeholder="Кол-во"
                type="number"
                value={String(edit.qty)}
                onChange={(e) => setEdit({ ...edit, qty: Number(e.target.value) || 1 })}
              />
              <select
                className="rounded-xl border border-line bg-white px-3 py-2.5"
                value={edit.userId || ""}
                onChange={(e) => setEdit({ ...edit, userId: e.target.value || null })}
              >
                <option value="">место пустует / без учётки</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}
                  </option>
                ))}
              </select>
              <Input
                placeholder="Подпись, если нет учётки (Маша, 18 стол…)"
                value={edit.holderName}
                onChange={(e) => setEdit({ ...edit, holderName: e.target.value })}
              />
              <Input
                placeholder="Примечание"
                value={edit.note}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              />
              <Input placeholder="Имя ПК" value={edit.pcHost} onChange={(e) => setEdit({ ...edit, pcHost: e.target.value })} />
              <Input
                placeholder="Процессор"
                value={edit.pcCpu}
                onChange={(e) => setEdit({ ...edit, pcCpu: e.target.value })}
              />
              <Input
                placeholder="Видеокарта"
                value={edit.pcGpu}
                onChange={(e) => setEdit({ ...edit, pcGpu: e.target.value })}
              />
              <Input placeholder="ОЗУ" value={edit.pcRam} onChange={(e) => setEdit({ ...edit, pcRam: e.target.value })} />
              <Input placeholder="Диск" value={edit.pcDisk} onChange={(e) => setEdit({ ...edit, pcDisk: e.target.value })} />
              <Input
                placeholder="Материнская плата"
                value={edit.pcMb}
                onChange={(e) => setEdit({ ...edit, pcMb: e.target.value })}
              />
              <div className="md:col-span-2 flex gap-2">
                <Button onClick={() => void save()}>Сохранить</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEdit(null);
                    setSaveError("");
                  }}
                >
                  Отмена
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <SortTh label="Инв. №" col="invNo" sortKey={sortKey} sortDir={sortDir} onSort={clickSort} />
              <SortTh label="Наименование" col="name" sortKey={sortKey} sortDir={sortDir} onSort={clickSort} />
              <SortTh label="Сотрудник" col="who" sortKey={sortKey} sortDir={sortDir} onSort={clickSort} />
              <SortTh label="ПК" col="pc" sortKey={sortKey} sortDir={sortDir} onSort={clickSort} />
              {manage ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={`border-t border-line ${r.status === "question" ? "bg-[#f7efe0]" : ""}`}>
                <td className="px-3 py-2 font-mono">{r.invNo || "б/н"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-navy">{r.name}</span>
                    {r.status === "question" ? <Pill tone="wait">под вопросом</Pill> : null}
                  </div>
                  {r.pcCpu ? (
                    <div className="text-xs text-muted">
                      {r.pcCpu}
                      {r.pcGpu ? ` · ${r.pcGpu}` : ""}
                      {r.pcRam ? ` · ${r.pcRam}` : ""}
                    </div>
                  ) : null}
                  {r.note ? <div className="text-xs text-muted">{r.note}</div> : null}
                </td>
                <td className="px-3 py-2">{who(r)}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.pcHost}</td>
                {manage ? (
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Button variant="ghost" onClick={() => openEdit({ ...r })}>
                      Изменить
                    </Button>
                    <Button variant="ghost" onClick={() => void remove(r.id)}>
                      Убрать
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

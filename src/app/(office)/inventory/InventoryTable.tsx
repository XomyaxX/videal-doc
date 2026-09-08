"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui";
import { fullName } from "@/lib/names";

type Person = { id: string; lastName: string; firstName: string; middleName: string; login: string };
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
};

function who(r: Row) {
  if (r.user) return fullName(r.user);
  if (r.holderName) return r.holderName;
  return "место пустует";
}

export function InventoryTable() {
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [manage, setManage] = useState(false);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<(typeof empty & { id?: string }) | null>(null);
  const [msg, setMsg] = useState("");

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

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase("ru");
    if (!s) return rows;
    return rows.filter((r) =>
      `${r.invNo} ${r.name} ${who(r)} ${r.pcHost} ${r.pcCpu} ${r.pcGpu} ${r.note}`.toLocaleLowerCase("ru").includes(s),
    );
  }, [rows, q]);

  async function save() {
    if (!edit) return;
    const body = { ...edit, userId: edit.userId || null };
    const res = await fetch(edit.id ? `/api/inventory/${edit.id}` : "/api/inventory", {
      method: edit.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setMsg("Не удалось сохранить");
      return;
    }
    setEdit(null);
    setMsg("Сохранено");
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
            <Button
              variant="secondary"
              onClick={() => setEdit({ ...empty })}
            >
              Добавить
            </Button>
          </>
        ) : null}
      </div>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}

      {edit && manage ? (
        <Card className="grid gap-2 md:grid-cols-2">
          <Input placeholder="Инв. №" value={edit.invNo} onChange={(e) => setEdit({ ...edit, invNo: e.target.value })} />
          <Input placeholder="Наименование" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
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
          <Input placeholder="Примечание" value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
          <Input placeholder="Имя ПК" value={edit.pcHost} onChange={(e) => setEdit({ ...edit, pcHost: e.target.value })} />
          <Input placeholder="Процессор" value={edit.pcCpu} onChange={(e) => setEdit({ ...edit, pcCpu: e.target.value })} />
          <Input placeholder="Видеокарта" value={edit.pcGpu} onChange={(e) => setEdit({ ...edit, pcGpu: e.target.value })} />
          <Input placeholder="ОЗУ" value={edit.pcRam} onChange={(e) => setEdit({ ...edit, pcRam: e.target.value })} />
          <Input placeholder="Диск" value={edit.pcDisk} onChange={(e) => setEdit({ ...edit, pcDisk: e.target.value })} />
          <Input placeholder="Материнская плата" value={edit.pcMb} onChange={(e) => setEdit({ ...edit, pcMb: e.target.value })} />
          <div className="md:col-span-2 flex gap-2">
            <Button onClick={() => void save()}>Сохранить</Button>
            <Button variant="secondary" onClick={() => setEdit(null)}>
              Отмена
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-line bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="text-muted">
              <th className="px-3 py-2">Инв. №</th>
              <th className="px-3 py-2">Наименование</th>
              <th className="px-3 py-2">Сотрудник</th>
              <th className="px-3 py-2">ПК</th>
              {manage ? <th className="px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className="px-3 py-2 font-mono">{r.invNo}</td>
                <td className="px-3 py-2">
                  <div className="font-semibold text-navy">{r.name}</div>
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
                    <Button variant="ghost" onClick={() => setEdit({ ...r })}>
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

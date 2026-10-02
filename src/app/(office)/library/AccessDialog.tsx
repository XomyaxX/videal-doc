"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { Lock } from "lucide-react";

type Person = { id: string; name: string; dept: string };

export function AccessDialog({
  itemId,
  title,
  isFolder,
  onClose,
  onSaved,
}: {
  itemId: string;
  title: string;
  isFolder?: boolean;
  onClose: () => void;
  onSaved?: (restricted: boolean) => void;
}) {
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [restricted, setRestricted] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let live = true;
    fetch(`/api/library/${itemId}/access`)
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) {
          setError(d.error);
          setBusy(false);
          return;
        }
        setPeople(d.people || []);
        setSelected(Array.isArray(d.userIds) ? d.userIds : []);
        setRestricted(Boolean(d.restricted));
        setBusy(false);
      })
      .catch(() => {
        if (!live) return;
        setError("Не удалось загрузить");
        setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [itemId]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return people;
    return people.filter((p) => p.name.toLowerCase().includes(s) || p.dept.toLowerCase().includes(s));
  }, [people, q]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (restricted && selected.length === 0) {
      setError("Отметьте хотя бы одного сотрудника или выключите ограничение");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/library/${itemId}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: restricted ? selected : [] }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    onSaved?.(Boolean(data.restricted));
    onClose();
  }

  const noun = isFolder ? "папку" : "файл";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow)] sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-navy">
          <Lock className="h-5 w-5" />
          <h2 className="font-serif text-xl">Доступ · {title}</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Кому из сотрудников видна эта {noun}. Остальным она не показывается. Руководство видит всё.
        </p>
        {busy ? (
          <p className="mt-4 text-sm text-muted">Загрузка…</p>
        ) : (
          <>
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-semibold">Ограничить доступ</span>
                <span className="block text-muted">Только отмеченные сотрудники. Вложенные папки тоже скрываются.</span>
              </span>
            </label>
            {restricted ? (
              <>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Поиск по фамилии"
                  className="mt-3 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
                />
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    className="font-semibold text-navy underline"
                    onClick={() => setSelected((prev) => [...new Set([...prev, ...shown.map((p) => p.id)])])}
                  >
                    Отметить найденных
                  </button>
                  <button type="button" className="font-semibold text-muted underline" onClick={() => setSelected([])}>
                    Снять всех
                  </button>
                </div>
                <ul className="mt-2 max-h-[40vh] space-y-1 overflow-y-auto rounded-xl border border-line bg-paper p-2">
                  {shown.length === 0 ? (
                    <li className="px-2 py-2 text-sm text-muted">Никого не нашли</li>
                  ) : (
                    shown.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-white">
                          <input
                            type="checkbox"
                            checked={selectedSet.has(p.id)}
                            onChange={() => toggle(p.id)}
                            className="mt-0.5"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-navy">{p.name}</span>
                            {p.dept ? <span className="block text-xs text-muted">{p.dept}</span> : null}
                          </span>
                        </label>
                      </li>
                    ))
                  )}
                </ul>
                <p className="mt-2 text-xs text-muted">Отмечено: {selected.length}</p>
              </>
            ) : (
              <p className="mt-3 text-sm text-muted">Сейчас {noun} видят все, у кого есть раздел «Хранилище».</p>
            )}
          </>
        )}
        {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" disabled={busy || saving} onClick={() => void save()}>
            Сохранить
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

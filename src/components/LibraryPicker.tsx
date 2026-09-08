"use client";

import { useEffect, useState } from "react";
import { LIBRARY_KINDS } from "@/lib/library-kinds";
import { LibraryThumb, type LibraryCard } from "./LibraryPreview";

export function LibraryPicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [rows, setRows] = useState<LibraryCard[]>([]);
  const [picked, setPicked] = useState<LibraryCard[]>([]);

  const searching = q.trim().length > 0;

  useEffect(() => {
    if (!searching) {
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      sp.set("q", q.trim());
      if (kind) sp.set("kind", kind);
      fetch(`/api/library?${sp}`)
        .then((r) => r.json())
        .then((d) => setRows(d.rows || []))
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, kind, searching]);

  useEffect(() => {
    if (selected.length === 0) {
      setPicked([]);
      return;
    }
    const missing = selected.filter((id) => !picked.some((p) => p.id === id) && !rows.some((r) => r.id === id));
    if (missing.length === 0) {
      const fromRows = rows.filter((r) => selected.includes(r.id));
      const keep = picked.filter((p) => selected.includes(p.id) && !fromRows.some((r) => r.id === p.id));
      setPicked([...keep, ...fromRows]);
      return;
    }
    Promise.all(missing.map((id) => fetch(`/api/library/${id}`).then((r) => r.json())))
      .then((list) => {
        const extra = list.map((d) => d.row).filter(Boolean);
        setPicked((prev) => {
          const map = new Map(prev.map((p) => [p.id, p]));
          for (const r of [...rows, ...extra]) if (selected.includes(r.id)) map.set(r.id, r);
          return selected.map((id) => map.get(id)).filter(Boolean) as LibraryCard[];
        });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.join(","), rows]);

  function toggle(item: LibraryCard) {
    if (selected.includes(item.id)) onChange(selected.filter((id) => id !== item.id));
    else onChange([...selected, item.id]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию или описанию"
          className="min-w-[200px] flex-1 rounded-xl border border-line bg-white px-3 py-2.5"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-xl border border-line bg-white px-3 py-2.5"
        >
          <option value="">Все типы</option>
          {LIBRARY_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      {picked.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p)}
              className="rounded-full bg-navy px-3 py-1 text-sm !text-white"
            >
              {p.title} ×
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted">Ничего не выбрано — начните вводить название, чтобы найти блок.</p>
      )}
      {searching ? (
        rows.length === 0 ? (
          <p className="text-sm text-muted">Ничего не нашлось.</p>
        ) : (
          <div className="grid max-h-80 grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
            {rows.map((item) => {
              const on = selected.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item)}
                  className={`overflow-hidden rounded-xl border text-left ${
                    on ? "border-gold ring-2 ring-gold" : "border-line bg-white"
                  }`}
                >
                  <LibraryThumb item={item} className="h-24 w-full" />
                  <div className="px-2 py-1.5">
                    <div className="truncate text-sm font-semibold text-navy">{item.title}</div>
                    <div className="truncate text-xs text-muted">
                      {item.kindLabel}
                      {item.fileCount && item.fileCount > 1 ? ` · ${item.fileCount} файлов` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <p className="text-sm text-muted">Материалы появятся после начала поиска.</p>
      )}
    </div>
  );
}

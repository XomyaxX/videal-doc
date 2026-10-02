"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";
import { LibraryThumb, type LibraryCard } from "@/components/LibraryPreview";
import { fmtDateTime } from "@/lib/dates";
import { useFinePointer } from "@/lib/pointer";
import { dataPageHref, type TrashEntry } from "@/lib/share-data-href";

function toCard(row: TrashEntry): LibraryCard {
  return {
    id: row.id,
    title: row.name,
    kind: row.isDir ? "folder" : "file",
    description: row.rel,
    originalName: row.name,
    mimeType: row.mime,
    uncPath: "",
    preview: row.preview,
    thumbUrl: "",
    fileUrl: "",
    href: "#",
    isFolder: row.isDir,
  };
}

export function TrashDesk({ entries }: { entries: TrashEntry[] }) {
  const router = useRouter();
  const desktop = useFinePointer();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<TrashEntry | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: TrashEntry } | null>(null);
  const ignoreClick = useRef(false);
  const longTimer = useRef(0);
  const longFrom = useRef({ x: 0, y: 0 });

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.clearTimeout(longTimer.current);
    };
  }, []);

  function clearLong() {
    window.clearTimeout(longTimer.current);
    longTimer.current = 0;
  }

  function onLongStart(e: React.PointerEvent, row: TrashEntry) {
    if (desktop || e.pointerType === "mouse") return;
    clearLong();
    longFrom.current = { x: e.clientX, y: e.clientY };
    longTimer.current = window.setTimeout(() => {
      ignoreClick.current = true;
      setSheet(row);
    }, 420) as unknown as number;
  }

  function onLongMove(e: React.PointerEvent) {
    if (!longTimer.current) return;
    const dx = e.clientX - longFrom.current.x;
    const dy = e.clientY - longFrom.current.y;
    if (dx * dx + dy * dy > 144) clearLong();
  }

  async function restore(id: string) {
    setBusy(id);
    setError("");
    setMenu(null);
    setSheet(null);
    const res = await fetch("/api/data/restore", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json().catch(() => ({}))) as { rel?: string; error?: string };
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось восстановить");
      return;
    }
    router.refresh();
    if (data.rel) router.push(dataPageHref(data.rel.includes("/") ? data.rel.slice(0, data.rel.lastIndexOf("/")) : ""));
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a href="/data" className="rounded-lg px-2 py-1 text-sm font-semibold text-navy hover:bg-paper-2">
          Data
        </a>
        <span className="text-muted">/</span>
        <span className="rounded-lg px-2 py-1 text-sm font-semibold text-navy">Корзина</span>
      </div>

      {error ? <p className="mb-3 text-sm text-bad">{error}</p> : null}

      <div className="grid min-h-[12rem] grid-cols-2 gap-3 rounded-2xl lg:grid-cols-3">
        {entries.length === 0 ? (
          <p className="col-span-2 text-sm text-muted lg:col-span-3">Корзина пуста. Удалённые с сайта файлы и папки появятся здесь.</p>
        ) : null}
        {entries.map((row) => {
          const item = toCard(row);
          return (
            <div
              key={row.id}
              className="relative overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)] hover:border-gold"
              onContextMenu={(e) => {
                if (!desktop) return;
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, row });
              }}
            >
              <button
                type="button"
                className="block w-full cursor-pointer touch-manipulation select-none text-left"
                onClick={() => {
                  if (ignoreClick.current) {
                    ignoreClick.current = false;
                    return;
                  }
                  if (!desktop) setSheet(row);
                }}
                onPointerDown={(e) => onLongStart(e, row)}
                onPointerMove={onLongMove}
                onPointerUp={clearLong}
                onPointerCancel={clearLong}
              >
                <LibraryThumb item={item} className="h-24 w-full sm:h-36" />
                <div className="p-3">
                  <div className="font-serif text-base text-navy sm:text-lg">{row.name}</div>
                  <p className="mt-1 truncate text-xs text-muted">{row.rel}</p>
                  <p className="text-xs text-muted">{fmtDateTime(row.deletedAt)}</p>
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {menu && desktop ? (
        <div
          className="fixed z-[70] min-w-[200px] rounded-xl border border-line bg-card py-1 shadow-[var(--shadow)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
            disabled={busy === menu.row.id}
            onClick={() => void restore(menu.row.id)}
          >
            Восстановить
          </button>
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-[80] bg-navy/40" onClick={() => setSheet(null)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 font-serif text-xl text-navy">{sheet.name}</p>
            <p className="mb-3 text-sm text-muted">{sheet.rel}</p>
            <div className="flex flex-col gap-2">
              <Button type="button" disabled={busy === sheet.id} onClick={() => void restore(sheet.id)}>
                <RotateCcw className="mr-1 inline h-4 w-4" />
                Восстановить
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSheet(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

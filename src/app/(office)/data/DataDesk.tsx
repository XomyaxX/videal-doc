"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Copy, Download, FolderInput, FolderPlus, Pencil, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui";
import { LibraryThumb, type LibraryCard } from "@/components/LibraryPreview";
import { useFinePointer } from "@/lib/pointer";
import { previewHasThumb } from "@/lib/library-kinds";
import { dataFileUrl, dataPageHref, dataViewHref, type DataEntry } from "@/lib/share-data-href";
import { DataUploadModal } from "./DataUploadModal";

const DIRECT_THUMB = /\.(jpe?g|png|webp|gif|svg)$/i;
const DIRECT_MAX = 2 * 1024 * 1024;

function toCard(row: DataEntry): LibraryCard {
  const fileUrl = dataFileUrl(row.rel);
  let thumbUrl = "";
  if (!row.isDir && previewHasThumb(row.preview)) {
    thumbUrl =
      row.preview === "image" && DIRECT_THUMB.test(row.name) && row.size > 0 && row.size <= DIRECT_MAX
        ? fileUrl
        : dataFileUrl(row.rel, { poster: true });
  }
  return {
    id: row.rel,
    title: row.name,
    kind: row.isDir ? "folder" : "file",
    description: "",
    originalName: row.name,
    mimeType: row.mime,
    uncPath: "",
    preview: row.preview,
    thumbUrl,
    fileUrl,
    href: row.isDir ? dataPageHref(row.rel) : dataViewHref(row.rel),
    isFolder: row.isDir,
  };
}

export function DataDesk({
  dir,
  crumbs,
  entries,
  canWork,
}: {
  dir: string;
  crumbs: { name: string; rel: string }[];
  entries: DataEntry[];
  canWork: boolean;
}) {
  const router = useRouter();
  const desktop = useFinePointer();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderTitle, setFolderTitle] = useState("");
  const [renameRel, setRenameRel] = useState("");
  const [renameVal, setRenameVal] = useState("");
  const [sheet, setSheet] = useState<DataEntry | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; row: DataEntry } | null>(null);
  const [osOver, setOsOver] = useState("");
  const [upload, setUpload] = useState<{ files: File[]; replaceName?: string; dir?: string } | null>(null);
  const [picker, setPicker] = useState<"copy" | "move" | null>(null);
  const [pickerSrc, setPickerSrc] = useState("");
  const [pickerDest, setPickerDest] = useState("");
  const [pickerCrumbs, setPickerCrumbs] = useState<{ name: string; rel: string }[]>([]);
  const [pickerFolders, setPickerFolders] = useState<{ name: string; rel: string }[]>([]);
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

  function onLongStart(e: React.PointerEvent, row: DataEntry) {
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

  async function makeFolder() {
    const name = folderTitle.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/data/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dir, name }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось создать папку");
      return;
    }
    setFolderTitle("");
    setFolderOpen(false);
    router.refresh();
  }

  async function saveRename(rel: string, name: string) {
    const title = name.trim();
    if (!title) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/data/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p: rel, name: title }),
    });
    const data = (await res.json().catch(() => ({}))) as { rel?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось переименовать");
      return;
    }
    setRenameRel("");
    router.refresh();
  }

  function isOsFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
  }

  async function loadPicker(rel: string) {
    const res = await fetch(`/api/data/tree?p=${encodeURIComponent(rel)}`);
    const data = (await res.json().catch(() => ({}))) as {
      rel?: string;
      crumbs?: { name: string; rel: string }[];
      folders?: { name: string; rel: string }[];
      error?: string;
    };
    if (!res.ok) {
      setError(data.error || "Не удалось открыть папки");
      return;
    }
    setPickerDest(data.rel || "");
    setPickerCrumbs(data.crumbs || []);
    setPickerFolders(data.folders || []);
  }

  async function startPicker(action: "copy" | "move", row: DataEntry) {
    setError("");
    setMenu(null);
    setSheet(null);
    setPicker(action);
    setPickerSrc(row.rel);
    await loadPicker(dir);
  }

  async function runBatch(action: "copy" | "move", items: string[], dest: string) {
    if (!items.length) return;
    setBusy(true);
    setError("");
    const res = await fetch("/api/data/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, items, dest }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; rels?: string[] };
    setBusy(false);
    if (data.rels?.length || res.ok) {
      setPicker(null);
      setPickerSrc("");
      router.refresh();
    }
    if (!res.ok) {
      setError(data.error || "Не удалось");
    }
  }

  async function toTrash(row: DataEntry) {
    if (row.isDir && !window.confirm(`Папка «${row.name}» и всё внутри попадут в корзину.`)) return;
    setBusy(true);
    setError("");
    setMenu(null);
    setSheet(null);
    const res = await fetch("/api/data/trash", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p: row.rel }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось переместить в корзину");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <a
          href="/data"
          className={`rounded-lg px-2 py-1 text-sm font-semibold text-navy hover:bg-paper-2 ${osOver === "crumb:" ? "ring-2 ring-gold/60" : ""}`}
          onDragOver={(e) => {
            if (!canWork) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = isOsFiles(e) ? "copy" : "move";
            setOsOver("crumb:");
          }}
          onDragLeave={() => {
            if (osOver === "crumb:") setOsOver("");
          }}
          onDrop={(e) => {
            if (!canWork) return;
            e.preventDefault();
            setOsOver("");
            if (isOsFiles(e)) {
              const files = [...e.dataTransfer.files].filter((f) => f.size > 0);
              if (files.length) setUpload({ files, dir: "" });
              return;
            }
            const rel = e.dataTransfer.getData("text/plain");
            if (rel) void runBatch("move", [rel], "");
          }}
        >
          Data
        </a>
        {crumbs.map((c) => (
          <span key={c.rel} className="flex items-center gap-2">
            <span className="text-muted">/</span>
            <a
              href={dataPageHref(c.rel)}
              className={`rounded-lg px-2 py-1 text-sm font-semibold text-navy hover:bg-paper-2 ${osOver === `crumb:${c.rel}` ? "ring-2 ring-gold/60" : ""}`}
              onDragOver={(e) => {
                if (!canWork) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = isOsFiles(e) ? "copy" : "move";
                setOsOver(`crumb:${c.rel}`);
              }}
              onDragLeave={() => {
                if (osOver === `crumb:${c.rel}`) setOsOver("");
              }}
              onDrop={(e) => {
                if (!canWork) return;
                e.preventDefault();
                setOsOver("");
                if (isOsFiles(e)) {
                  const files = [...e.dataTransfer.files].filter((f) => f.size > 0);
                  if (files.length) setUpload({ files, dir: c.rel });
                  return;
                }
                const rel = e.dataTransfer.getData("text/plain");
                if (rel) void runBatch("move", [rel], c.rel);
              }}
            >
              {c.name}
            </a>
          </span>
        ))}
        <span className="ml-auto flex flex-wrap gap-2">
          {canWork ? (
            <>
              <Button type="button" variant="secondary" onClick={() => setFolderOpen(true)}>
                <FolderPlus className="mr-1 inline h-4 w-4" />
                Папка
              </Button>
              <Button type="button" onClick={() => setUpload({ files: [] })}>
                <Upload className="mr-1 inline h-4 w-4" />
                Загрузить
              </Button>
              <Button href="/data/trash" variant="secondary">
                <Trash2 className="mr-1 inline h-4 w-4" />
                Корзина
              </Button>
            </>
          ) : null}
        </span>
      </div>

      {folderOpen && canWork ? (
        <form
          className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-card p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void makeFolder();
          }}
        >
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-xs font-semibold text-muted">Новая папка</span>
            <input
              autoFocus
              value={folderTitle}
              onChange={(e) => setFolderTitle(e.target.value)}
              className="w-full rounded-xl border border-line px-3 py-2"
            />
          </label>
          <Button type="submit" disabled={busy}>
            Создать
          </Button>
          <Button type="button" variant="ghost" onClick={() => setFolderOpen(false)}>
            Отмена
          </Button>
        </form>
      ) : null}

      {error ? <p className="mb-3 text-sm text-bad">{error}</p> : null}
      {busy ? <p className="mb-3 text-sm text-muted">Подождите…</p> : null}

      {picker && canWork ? (
        <div className="mb-4 rounded-2xl border border-line bg-card p-4">
          <div className="font-serif text-lg text-navy">{picker === "move" ? "Куда переместить" : "Куда копировать"}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
            <button type="button" className="rounded px-1 font-semibold text-navy underline" onClick={() => void loadPicker("")}>
              Data
            </button>
            {pickerCrumbs.map((c) => (
              <span key={c.rel} className="flex items-center gap-1">
                <span className="text-muted">/</span>
                <button type="button" className="rounded px-1 font-semibold text-navy underline" onClick={() => void loadPicker(c.rel)}>
                  {c.name}
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line bg-white p-2">
            {pickerFolders.length === 0 ? <p className="px-2 py-1 text-sm text-muted">В этой папке нет подпапок.</p> : null}
            {pickerFolders.map((f) => (
              <button
                key={f.rel}
                type="button"
                disabled={f.rel === pickerSrc || f.rel.startsWith(`${pickerSrc}/`)}
                onClick={() => void loadPicker(f.rel)}
                className="block w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-paper-2 disabled:opacity-40"
              >
                {f.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">Сейчас: {pickerDest ? pickerDest : "корень Data"}</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void runBatch(picker, [pickerSrc], pickerDest)}>
              {picker === "move" ? "Переместить сюда" : "Копировать сюда"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setPicker(null)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={`grid min-h-[12rem] grid-cols-2 gap-3 rounded-2xl lg:grid-cols-3 ${
          osOver === "here" ? "ring-2 ring-gold/50 ring-offset-2 ring-offset-paper" : ""
        }`}
        onDragOver={(e) => {
          if (!canWork) return;
          if (isOsFiles(e)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setOsOver("here");
          }
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setOsOver("");
        }}
        onDrop={(e) => {
          if (!canWork) return;
          e.preventDefault();
          setOsOver("");
          const files = [...e.dataTransfer.files].filter((f) => f.size > 0);
          if (files.length) setUpload({ files });
        }}
      >
        {entries.length === 0 ? <p className="col-span-2 text-sm text-muted lg:col-span-3">В этой папке пока пусто.</p> : null}
        {entries.map((row) => {
          const item = toCard(row);
          return (
            <div
              key={row.rel}
              className={`relative overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)] hover:border-gold ${
                osOver === row.rel ? "ring-2 ring-gold/60" : ""
              }`}
              draggable={desktop && canWork && renameRel !== row.rel}
              onDragStart={(e) => {
                if (!desktop || !canWork) return;
                e.dataTransfer.setData("text/plain", row.rel);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!canWork || !row.isDir) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = isOsFiles(e) ? "copy" : "move";
                setOsOver(row.rel);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                if (osOver === row.rel) setOsOver("");
              }}
              onDrop={(e) => {
                if (!canWork || !row.isDir) return;
                e.preventDefault();
                e.stopPropagation();
                setOsOver("");
                if (isOsFiles(e)) {
                  const files = [...e.dataTransfer.files].filter((f) => f.size > 0);
                  if (files.length) setUpload({ files, dir: row.rel });
                  return;
                }
                const rel = e.dataTransfer.getData("text/plain");
                if (rel && rel !== row.rel) void runBatch("move", [rel], row.rel);
              }}
              onContextMenu={(e) => {
                if (!desktop) return;
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, row });
              }}
            >
              <a
                href={item.href}
                draggable={false}
                onClick={(e) => {
                  if (ignoreClick.current) {
                    e.preventDefault();
                    ignoreClick.current = false;
                  }
                }}
                onPointerDown={(e) => onLongStart(e, row)}
                onPointerMove={onLongMove}
                onPointerUp={clearLong}
                onPointerCancel={clearLong}
                className="block cursor-pointer touch-manipulation select-none"
              >
                <LibraryThumb item={item} className="h-24 w-full sm:h-36" />
                <div className="p-3">
                  {renameRel === row.rel ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(row.rel, renameVal);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={(e) => setRenameVal(e.target.value)}
                        className="w-full rounded-lg border border-line px-2 py-1 text-sm"
                      />
                    </form>
                  ) : (
                    <div className="font-serif text-base text-navy sm:text-lg">{row.name}</div>
                  )}
                </div>
              </a>
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
          <a href={menu.row.isDir ? dataPageHref(menu.row.rel) : dataViewHref(menu.row.rel)} className="block px-3 py-2 text-sm hover:bg-paper-2">
            Открыть
          </a>
          {!menu.row.isDir ? (
            <a href={dataFileUrl(menu.row.rel, { dl: true })} className="block px-3 py-2 text-sm hover:bg-paper-2">
              Скачать
            </a>
          ) : null}
          {canWork ? (
            <>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                onClick={() => void startPicker("copy", menu.row)}
              >
                Копировать
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                onClick={() => void startPicker("move", menu.row)}
              >
                Переместить
              </button>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                onClick={() => {
                  setRenameRel(menu.row.rel);
                  setRenameVal(menu.row.name);
                  setMenu(null);
                }}
              >
                Переименовать
              </button>
              {!menu.row.isDir ? (
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                  onClick={() => {
                    setMenu(null);
                    setUpload({ files: [], replaceName: menu.row.name });
                  }}
                >
                  Заменить файл
                </button>
              ) : null}
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-bad hover:bg-paper-2"
                disabled={busy}
                onClick={() => void toTrash(menu.row)}
              >
                В корзину
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-[80] bg-navy/40" onClick={() => setSheet(null)}>
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-serif text-xl text-navy">{sheet.name}</p>
            <div className="flex flex-col gap-2">
              <Button href={sheet.isDir ? dataPageHref(sheet.rel) : dataViewHref(sheet.rel)}>Открыть</Button>
              {!sheet.isDir ? (
                <Button href={dataFileUrl(sheet.rel, { dl: true })} variant="secondary">
                  <Download className="mr-1 inline h-4 w-4" />
                  Скачать
                </Button>
              ) : null}
              {canWork ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => void startPicker("copy", sheet)}>
                    <Copy className="mr-1 inline h-4 w-4" />
                    Копировать
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => void startPicker("move", sheet)}>
                    <FolderInput className="mr-1 inline h-4 w-4" />
                    Переместить
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setRenameRel(sheet.rel);
                      setRenameVal(sheet.name);
                      setSheet(null);
                    }}
                  >
                    <Pencil className="mr-1 inline h-4 w-4" />
                    Переименовать
                  </Button>
                  {!sheet.isDir ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setSheet(null);
                        setUpload({ files: [], replaceName: sheet.name });
                      }}
                    >
                      Заменить файл
                    </Button>
                  ) : null}
                  <Button type="button" variant="danger" disabled={busy} onClick={() => void toTrash(sheet)}>
                    <Trash2 className="mr-1 inline h-4 w-4" />
                    В корзину
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="ghost" onClick={() => setSheet(null)}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {upload && canWork ? (
        <DataUploadModal
          dir={upload.dir ?? dir}
          folderLabel={
            upload.dir
              ? upload.dir.split("/").filter(Boolean).join(" / ") || "Data"
              : crumbs.length
                ? crumbs.map((c) => c.name).join(" / ")
                : "Data"
          }
          replaceName={upload.replaceName}
          initialFiles={upload.files}
          onClose={() => setUpload(null)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

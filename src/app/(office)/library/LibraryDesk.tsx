"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FolderInput,
  FolderPlus,
  Link2,
  Lock,
  Pencil,
  SquareDashedMousePointer,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Pill } from "@/components/ui";
import { LibraryThumb, type LibraryCard } from "@/components/LibraryPreview";
import { guessLibraryKind, libraryKindOk, LIBRARY_KIND_LABEL, titleFromFilename } from "@/lib/library-kinds";
import { uploadLibraryFile } from "@/lib/library-upload";
import { useFinePointer } from "@/lib/pointer";
import { AccessDialog } from "./AccessDialog";
import { ShareDialog, type ShareState } from "./ShareDialog";

type FolderRow = { id: string; title: string; parentId: string | null };
type Menu = { x: number; y: number; ids: string[]; blank: boolean };

export function LibraryDesk({
  items,
  folderId,
  crumbs,
  manage,
  q,
  kind,
  guest,
}: {
  items: LibraryCard[];
  folderId: string;
  crumbs: { id: string; title: string }[];
  manage: boolean;
  q: string;
  kind: string;
  guest?: { token: string; download: boolean; edit: boolean; create: boolean; rootId: string };
}) {
  const router = useRouter();
  const desktop = useFinePointer();
  const [selected, setSelected] = useState<string[]>([]);
  const [last, setLast] = useState("");
  const [picker, setPicker] = useState<"move" | "copy" | null>(null);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overId, setOverId] = useState("");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [sheet, setSheet] = useState<Menu | null>(null);
  const [shareFor, setShareFor] = useState<LibraryCard | null>(null);
  const [shares, setShares] = useState<Record<string, ShareState>>({});
  const [accessFor, setAccessFor] = useState<LibraryCard | null>(null);
  const [aclOn, setAclOn] = useState<Record<string, boolean>>({});
  const [renameId, setRenameId] = useState("");
  const [renameVal, setRenameVal] = useState("");
  const [osOver, setOsOver] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderTitle, setFolderTitle] = useState("");
  const filePick = useRef<HTMLInputElement>(null);
  const ignoreClick = useRef(false);
  const longTimer = useRef(0);
  const longFrom = useRef({ x: 0, y: 0 });

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const canEdit = manage || Boolean(guest?.edit);
  const canCreate = manage || Boolean(guest?.create);
  const canUpload = manage;
  const canZip = !guest || guest.download;
  const destRoot = guest?.rootId || "";
  const batchUrl = guest ? `/api/l/${guest.token}/batch` : "/api/library/batch";
  const treeUrl = guest ? `/api/l/${guest.token}/tree` : "/api/library/tree";

  useEffect(() => {
    function close() {
      setMenu(null);
    }
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(longTimer.current);
  }, []);

  function pick(id: string, e: React.MouseEvent) {
    const idx = items.findIndex((x) => x.id === id);
    if (e.shiftKey && last) {
      const a = items.findIndex((x) => x.id === last);
      if (a >= 0 && idx >= 0) {
        const [lo, hi] = a < idx ? [a, idx] : [idx, a];
        setSelected(items.slice(lo, hi + 1).map((x) => x.id));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    } else {
      setSelected([id]);
    }
    setLast(id);
  }

  function open(item: LibraryCard) {
    router.push(item.href);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setLast(id);
  }

  function onCardClick(e: React.MouseEvent, item: LibraryCard) {
    if (ignoreClick.current) {
      e.preventDefault();
      ignoreClick.current = false;
      return;
    }
    if (renameId === item.id) {
      e.preventDefault();
      return;
    }
    if (!desktop && selected.length > 0) {
      e.preventDefault();
      toggleSelect(item.id);
      return;
    }
    if (desktop && canEdit) {
      e.preventDefault();
      pick(item.id, e);
    }
  }

  function clearLong() {
    window.clearTimeout(longTimer.current);
    longTimer.current = 0;
  }

  function onLongStart(e: React.PointerEvent, item: LibraryCard) {
    if (desktop || e.pointerType === "mouse") return;
    clearLong();
    longFrom.current = { x: e.clientX, y: e.clientY };
    longTimer.current = window.setTimeout(() => {
      ignoreClick.current = true;
      const ids = selectedSet.has(item.id) && selected.length ? selected : [item.id];
      if (!selectedSet.has(item.id)) setSelected([item.id]);
      setSheet({ x: 0, y: 0, ids, blank: false });
    }, 420) as unknown as number;
  }

  function onLongMove(e: React.PointerEvent) {
    if (!longTimer.current) return;
    const dx = e.clientX - longFrom.current.x;
    const dy = e.clientY - longFrom.current.y;
    if (dx * dx + dy * dy > 144) clearLong();
  }

  function isOsFiles(e: React.DragEvent) {
    return Array.from(e.dataTransfer?.types || []).includes("Files");
  }

  async function ingestOsDrop(parentId: string, dt: DataTransfer) {
    const list = [...dt.files].filter((f) => f.size > 0);
    await ingestFiles(parentId, list);
  }

  async function ingestFiles(parentId: string, list: File[]) {
    if (!canUpload) return;
    if (!list.length) return;
    setBusy(true);
    setError("");
    const created = new Map<string, string>();
    created.set("", parentId);
    async function ensureDir(rel: string): Promise<string> {
      const key = rel.replace(/\\/g, "/").replace(/\/+$/, "");
      if (!key) return parentId;
      const cached = created.get(key);
      if (cached) return cached;
      const parts = key.split("/").filter(Boolean);
      const title = parts[parts.length - 1] || "папка";
      const parentPath = parts.slice(0, -1).join("/");
      const parentFolderId: string = parentPath ? await ensureDir(parentPath) : parentId;
      const folderRes = await fetch("/api/library/folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, parentId: parentFolderId }),
      });
      const folderData = (await folderRes.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!folderRes.ok || !folderData.id) throw new Error(folderData.error || "Не удалось создать папку");
      created.set(key, folderData.id);
      return folderData.id;
    }
    try {
      for (const file of list) {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
        const fileName = parts.pop() || file.name;
        const dir = parts.join("/");
        const pid = await ensureDir(dir);
        await uploadLibraryFile({
          file,
          fileName,
          parentId: pid || undefined,
          title: titleFromFilename(fileName),
          kind: kind && libraryKindOk(kind) ? kind : guessLibraryKind(fileName),
          description: titleFromFilename(fileName),
        });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить");
    }
    setBusy(false);
    setOsOver("");
  }

  async function loadTree() {
    const res = await fetch(treeUrl);
    const data = await res.json().catch(() => ({}));
    setFolders(data.rows || []);
  }

  async function run(action: "move" | "copy", ids: string[], destParentId: string) {
    if (!ids.length) return;
    setBusy(true);
    setError("");
    const res = await fetch(batchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ids, destParentId }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    setPicker(null);
    setSelected([]);
    router.refresh();
  }

  async function startPicker(action: "move" | "copy", ids?: string[]) {
    if (ids) setSelected(ids);
    await loadTree();
    setDest(folderId || destRoot);
    setPicker(action);
  }

  function zipHref(ids?: string[]) {
    if (guest) {
      const p = ids?.[0] || folderId;
      const q = p && p !== guest.rootId ? `?p=${p}` : "";
      return `/api/l/${guest.token}/zip${q}`;
    }
    if (ids?.length) return `/api/library/zip?ids=${ids.join(",")}`;
    return folderId ? `/api/library/zip?folder=${folderId}` : "/api/library/zip";
  }

  function openMenu(e: React.MouseEvent, item?: LibraryCard) {
    e.preventDefault();
    e.stopPropagation();
    if (!desktop) return;
    const ids = item ? (selectedSet.has(item.id) ? selected : [item.id]) : selected;
    if (item && !selectedSet.has(item.id)) setSelected([item.id]);
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 280);
    setMenu({ x, y, ids: item ? ids : selected, blank: !item });
    setSheet(null);
  }

  async function saveRename() {
    const id = renameId;
    const title = renameVal.trim();
    if (!id || !title) return;
    setBusy(true);
    const res = guest
      ? await fetch(`/api/l/${guest.token}/rename`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, title }),
        })
      : await fetch(`/api/library/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось переименовать");
      return;
    }
    setRenameId("");
    router.refresh();
  }

  async function removeItems(ids: string[]) {
    if (!manage || !ids.length) return;
    const n = ids.length;
    if (!confirm(n === 1 ? "Убрать из хранилища? С диска файл не сотрётся." : `Убрать ${n} объектов из хранилища? С диска файлы не сотрутся.`)) return;
    setBusy(true);
    setError("");
    for (const id of ids) {
      const res = await fetch(`/api/library/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось удалить");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setSelected([]);
    router.refresh();
  }

  async function makeFolder(e?: React.FormEvent) {
    e?.preventDefault();
    const title = folderTitle.trim();
    if (!title) {
      setFolderOpen(true);
      return;
    }
    setBusy(true);
    const res = await fetch(guest ? `/api/l/${guest.token}/folder` : "/api/library/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, parentId: folderId || destRoot }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Не удалось создать папку");
      return;
    }
    setFolderTitle("");
    setFolderOpen(false);
    router.refresh();
  }

  function FolderTree({ parentId, depth }: { parentId: string | null; depth: number }) {
    const rows = folders.filter((f) => (f.parentId || null) === parentId);
    return (
      <>
        {rows.map((f) => (
          <div key={f.id}>
            <button
              type="button"
              disabled={selectedSet.has(f.id)}
              onClick={() => setDest(f.id)}
              className={`block w-full rounded-lg px-2 py-1 text-left text-sm ${
                dest === f.id ? "bg-navy text-white" : "hover:bg-paper-2"
              } disabled:opacity-40`}
              style={{ paddingLeft: 8 + depth * 14 }}
            >
              {f.title}
            </button>
            <FolderTree parentId={f.id} depth={depth + 1} />
          </div>
        ))}
      </>
    );
  }

  function crumbHref(folder?: string) {
    if (guest) return folder && folder !== guest.rootId ? `/l/${guest.token}?p=${folder}` : `/l/${guest.token}`;
    const p = new URLSearchParams();
    if (folder) p.set("folder", folder);
    if (q) p.set("q", q);
    if (kind) p.set("kind", kind);
    const s = p.toString();
    return s ? `/library?${s}` : "/library";
  }

  function crumbDrop(id: string) {
    const destId = id || destRoot;
    return canEdit || canUpload
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (isOsFiles(e)) {
              if (!canUpload) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
              return;
            }
            if (!canEdit) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move" as const;
          },
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            if (isOsFiles(e)) {
              void ingestOsDrop(destId, e.dataTransfer);
              return;
            }
            if (!canEdit) return;
            const ids = e.dataTransfer.getData("text/plain").split(",").filter(Boolean);
            void run("move", ids, destId);
          },
        }
      : {};
  }

  const menuSrc = sheet || menu;
  const menuItem = menuSrc && !menuSrc.blank && menuSrc.ids[0] ? items.find((x) => x.id === menuSrc.ids[0]) : null;
  const menuIds = menuSrc?.ids || [];

  function closeMenus() {
    setMenu(null);
    setSheet(null);
  }

  return (
    <div
      onContextMenu={(e) => {
        if (!desktop) {
          e.preventDefault();
          return;
        }
        openMenu(e);
      }}
    >
      <nav className="mb-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm">
        <a href={crumbHref()} className="shrink-0 rounded px-1 py-1 font-semibold text-navy underline" {...crumbDrop(destRoot)}>
          {guest ? crumbs[0]?.title || "Корень" : "Корень"}
        </a>
        {crumbs.filter((c) => !guest || c.id !== guest.rootId).map((c) => (
          <span key={c.id} className="flex shrink-0 items-center gap-1">
            <span className="text-muted">/</span>
            <a href={crumbHref(c.id)} className="rounded px-1 py-1 font-semibold text-navy underline" {...crumbDrop(c.id)}>
              {c.title}
            </a>
          </span>
        ))}
      </nav>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {canZip ? (
          <Button href={zipHref()} variant="secondary">
            <Download className="mr-1 inline h-4 w-4" />
            Zip
          </Button>
        ) : null}
        {canUpload ? (
          <>
            <input
              ref={filePick}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const list = e.target.files ? [...e.target.files].filter((f) => f.size > 0) : [];
                e.target.value = "";
                void ingestFiles(folderId || destRoot, list);
              }}
            />
            <Button type="button" variant="secondary" onClick={() => filePick.current?.click()}>
              <Upload className="mr-1 inline h-4 w-4" />
              Загрузить
            </Button>
          </>
        ) : null}
        {canCreate && !folderOpen ? (
          <Button type="button" variant="ghost" onClick={() => setFolderOpen(true)}>
            <FolderPlus className="mr-1 inline h-4 w-4" />
            Папка
          </Button>
        ) : null}
        {items.length > 0 ? (
          <button
            type="button"
            className="text-sm font-semibold text-navy underline"
            onClick={() => setSelected(items.map((x) => x.id))}
          >
            Выделить всё
          </button>
        ) : null}
      </div>
      {folderOpen ? (
        <form onSubmit={(e) => void makeFolder(e)} className="mb-4 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={folderTitle}
            onChange={(e) => setFolderTitle(e.target.value)}
            placeholder="Название папки"
            className="min-w-[10rem] flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-[15px]"
            required
          />
          <Button type="submit" disabled={busy}>
            Создать
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setFolderOpen(false); setFolderTitle(""); }}>
            Отмена
          </Button>
        </form>
      ) : null}
      {error ? <p className="mb-3 text-sm text-bad">{error}</p> : null}
      {busy ? <p className="mb-3 text-sm text-muted">Загрузка файлов…</p> : null}
      {canUpload && desktop ? (
        <p className="mb-3 text-xs text-muted">Сюда можно перетащить любой файл: mp3, pdf, архив, видео — или нажать «Загрузить».</p>
      ) : null}
      {!desktop && selected.length > 0 ? (
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-30 mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-[var(--shadow)]">
          <span className="px-2 text-sm font-semibold text-navy">Выбрано {selected.length}</span>
          {canEdit ? (
            <>
              <Button type="button" variant="secondary" onClick={() => void startPicker("copy", selected)}>
                Копировать
              </Button>
              <Button type="button" variant="secondary" onClick={() => void startPicker("move", selected)}>
                Переместить
              </Button>
            </>
          ) : null}
          {canZip ? (
            <Button href={zipHref(selected)} variant="ghost">
              Zip
            </Button>
          ) : null}
          {manage ? (
            <Button type="button" variant="ghost" onClick={() => void removeItems(selected)}>
              Удалить
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={() => setSelected([])}>
            Снять
          </Button>
        </div>
      ) : null}

      {picker ? (
        <div className="mb-4 rounded-2xl border border-line bg-card p-4">
          <div className="font-serif text-lg text-navy">{picker === "move" ? "Куда переместить" : "Куда копировать"}</div>
          <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-line bg-white p-2">
            <button
              type="button"
              onClick={() => setDest(destRoot)}
              className={`block w-full rounded-lg px-2 py-1 text-left text-sm ${dest === destRoot ? "bg-navy text-white" : "hover:bg-paper-2"}`}
            >
              {guest ? "Корень ссылки" : "Корень хранилища"}
            </button>
            <FolderTree parentId={guest ? destRoot : null} depth={0} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" disabled={busy} onClick={() => void run(picker, selected, dest)}>
              {picker === "move" ? "Переместить" : "Копировать"}
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
          if (isOsFiles(e)) {
            if (!canUpload) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setOsOver("here");
            return;
          }
          if (!canEdit) return;
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          if (osOver === "here") setOsOver("");
        }}
        onDrop={(e) => {
          if (isOsFiles(e)) {
            e.preventDefault();
            void ingestOsDrop(folderId || destRoot, e.dataTransfer);
            return;
          }
        }}
      >
        {items.length === 0 ? <p className="col-span-2 text-sm text-muted lg:col-span-3">В этой папке пока пусто.</p> : null}
        {items.map((item) => {
          const on = selectedSet.has(item.id);
          const droppable = (canEdit || canUpload) && item.isFolder && !selectedSet.has(item.id);
          const shareOn = shares[item.id]?.enabled ?? item.shareEnabled;
          const isRestricted = aclOn[item.id] ?? Boolean(item.restricted);
          return (
            <div
              key={item.id}
              className={`relative overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow)] ${
                on ? "border-gold ring-2 ring-gold/40" : overId === item.id ? "border-gold" : "border-line hover:border-gold"
              }`}
              onContextMenu={(e) => openMenu(e, item)}
            >
              {shareOn || isRestricted ? (
                <span className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1">
                  {isRestricted ? (
                    <span className="rounded-full bg-navy/80 p-1.5 text-white" title="Ограниченный доступ">
                      <Lock className="h-4 w-4" />
                    </span>
                  ) : null}
                  {shareOn ? (
                    <span className="rounded-full bg-navy/80 p-1.5 text-white" title="Есть ссылка">
                      <Link2 className="h-4 w-4" />
                    </span>
                  ) : null}
                </span>
              ) : null}
              <a
                href={item.href}
                draggable={desktop && canEdit}
                onClick={(e) => onCardClick(e, item)}
                onDoubleClick={(e) => {
                  if (!desktop) return;
                  e.preventDefault();
                  open(item);
                }}
                onPointerDown={(e) => onLongStart(e, item)}
                onPointerMove={onLongMove}
                onPointerUp={clearLong}
                onPointerCancel={clearLong}
                onDragStart={(e) => {
                  const ids = selectedSet.has(item.id) ? selected : [item.id];
                  if (!selectedSet.has(item.id)) setSelected(ids);
                  e.dataTransfer.setData("text/plain", ids.join(","));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (isOsFiles(e)) {
                    if (!canUpload || !item.isFolder) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "copy";
                    setOverId(item.id);
                    return;
                  }
                  if (!droppable || !canEdit) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverId(item.id);
                }}
                onDragLeave={() => {
                  if (overId === item.id) setOverId("");
                }}
                onDrop={(e) => {
                  if (isOsFiles(e)) {
                    if (!canUpload || !item.isFolder) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setOverId("");
                    void ingestOsDrop(item.id, e.dataTransfer);
                    return;
                  }
                  if (!droppable || !canEdit) return;
                  e.preventDefault();
                  setOverId("");
                  const ids = e.dataTransfer.getData("text/plain").split(",").filter(Boolean);
                  void run("move", ids, item.id);
                }}
                className="block cursor-pointer touch-manipulation select-none"
              >
                <LibraryThumb item={item} className="h-24 w-full sm:h-36" />
                <div className="p-3">
                  {renameId === item.id ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename();
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-serif text-base text-navy sm:text-lg">{item.title}</div>
                      {item.isFolder ? null : (
                        <Pill tone="draft">{item.kindLabel || LIBRARY_KIND_LABEL[item.kind]}</Pill>
                      )}
                    </div>
                  )}
                  {item.isFolder || item.description ? null : (
                    <p className="mt-1 text-xs text-muted">
                      {(item.fileCount ?? 0) > 1 ? `${item.fileCount} файлов` : item.originalName}
                    </p>
                  )}
                </div>
              </a>
            </div>
          );
        })}
      </div>

      {menu && desktop ? (
        <div
          className="fixed z-[70] min-w-[210px] rounded-xl border border-line bg-card py-1 shadow-[var(--shadow)]"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <ItemMenu
            blank={menu.blank}
            menuItem={menuItem}
            ids={menuIds}
            canCreate={canCreate}
            canUpload={canUpload}
            canEdit={canEdit}
            canZip={canZip}
            manage={manage}
            zipHref={zipHref(menuIds)}
            onUpload={() => {
              closeMenus();
              filePick.current?.click();
            }}
            onFolder={() => {
              closeMenus();
              setFolderOpen(true);
            }}
            onOpen={() => {
              closeMenus();
              if (menuItem) open(menuItem);
            }}
            onRename={() => {
              closeMenus();
              if (!menuItem) return;
              setRenameId(menuItem.id);
              setRenameVal(menuItem.title);
            }}
            onCopy={() => {
              closeMenus();
              void startPicker("copy", menuIds);
            }}
            onMove={() => {
              closeMenus();
              void startPicker("move", menuIds);
            }}
            onShare={() => {
              closeMenus();
              if (menuItem) setShareFor(menuItem);
            }}
            onAccess={() => {
              closeMenus();
              if (menuItem) setAccessFor(menuItem);
            }}
            onZip={closeMenus}
            onDelete={() => {
              closeMenus();
              void removeItems(menuIds);
            }}
          />
        </div>
      ) : null}

      {sheet ? (
        <div className="fixed inset-0 z-[70]">
          <button type="button" className="absolute inset-0 bg-navy/40" aria-label="Закрыть" onClick={closeMenus} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border border-line bg-card pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-[var(--shadow)]">
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />
            <ItemMenu
              blank={sheet.blank}
              menuItem={menuItem}
              ids={menuIds}
              canCreate={canCreate}
              canUpload={false}
              canEdit={canEdit}
              canZip={canZip}
              manage={manage}
              zipHref={zipHref(menuIds)}
              pad
              onFolder={() => {
                closeMenus();
                setFolderOpen(true);
              }}
              onOpen={() => {
                closeMenus();
                if (menuItem) open(menuItem);
              }}
              onRename={() => {
                closeMenus();
                if (!menuItem) return;
                setRenameId(menuItem.id);
                setRenameVal(menuItem.title);
              }}
              onCopy={() => {
                closeMenus();
                void startPicker("copy", menuIds);
              }}
              onMove={() => {
                closeMenus();
                void startPicker("move", menuIds);
              }}
              onShare={() => {
                closeMenus();
                if (menuItem) setShareFor(menuItem);
              }}
              onAccess={() => {
                closeMenus();
                if (menuItem) setAccessFor(menuItem);
              }}
              onZip={closeMenus}
              onDelete={() => {
                closeMenus();
                void removeItems(menuIds);
              }}
            />
          </div>
        </div>
      ) : null}

      {shareFor ? (
        <ShareDialog
          itemId={shareFor.id}
          title={shareFor.title}
          initial={{
            enabled: shares[shareFor.id]?.enabled ?? Boolean(shareFor.shareEnabled),
            token: shares[shareFor.id]?.token ?? shareFor.shareToken ?? "",
            download: shares[shareFor.id]?.download ?? shareFor.shareDownload !== false,
            edit: shares[shareFor.id]?.edit ?? Boolean(shareFor.shareEdit),
            create: shares[shareFor.id]?.create ?? Boolean(shareFor.shareCreate),
          }}
          onClose={() => setShareFor(null)}
          onSaved={(s) => setShares((prev) => ({ ...prev, [shareFor.id]: s }))}
        />
      ) : null}

      {accessFor && manage ? (
        <AccessDialog
          itemId={accessFor.id}
          title={accessFor.title}
          isFolder={Boolean(accessFor.isFolder)}
          onClose={() => setAccessFor(null)}
          onSaved={(restricted) => setAclOn((prev) => ({ ...prev, [accessFor.id]: restricted }))}
        />
      ) : null}
    </div>
  );
}

function ItemMenu({
  blank,
  menuItem,
  ids,
  canCreate,
  canUpload,
  canEdit,
  canZip,
  manage,
  zipHref,
  pad,
  onUpload,
  onFolder,
  onOpen,
  onRename,
  onCopy,
  onMove,
  onShare,
  onAccess,
  onZip,
  onDelete,
}: {
  blank: boolean;
  menuItem: LibraryCard | null | undefined;
  ids: string[];
  canCreate: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canZip: boolean;
  manage: boolean;
  zipHref: string;
  pad?: boolean;
  onUpload?: () => void;
  onFolder: () => void;
  onOpen: () => void;
  onRename: () => void;
  onCopy: () => void;
  onMove: () => void;
  onShare: () => void;
  onAccess?: () => void;
  onZip: () => void;
  onDelete: () => void;
}) {
  if (blank) {
    if (!canCreate && !canUpload) return <p className="px-3 py-2 text-xs text-muted">Нет действий</p>;
    return (
      <>
        {canUpload && onUpload ? (
          <MenuBtn pad={pad} icon={<Upload className="h-4 w-4" />} onClick={onUpload}>
            Загрузить файлы
          </MenuBtn>
        ) : null}
        {canCreate ? (
          <MenuBtn pad={pad} icon={<FolderPlus className="h-4 w-4" />} onClick={onFolder}>
            Новая папка
          </MenuBtn>
        ) : null}
      </>
    );
  }
  return (
    <>
      {menuItem ? (
        <MenuBtn pad={pad} icon={<SquareDashedMousePointer className="h-4 w-4" />} onClick={onOpen}>
          Открыть
        </MenuBtn>
      ) : null}
      {canEdit && menuItem?.isFolder ? (
        <MenuBtn pad={pad} icon={<Pencil className="h-4 w-4" />} onClick={onRename}>
          Переименовать
        </MenuBtn>
      ) : null}
      {canEdit ? (
        <>
          <MenuBtn pad={pad} icon={<Copy className="h-4 w-4" />} onClick={onCopy}>
            Копировать
          </MenuBtn>
          <MenuBtn pad={pad} icon={<FolderInput className="h-4 w-4" />} onClick={onMove}>
            Переместить
          </MenuBtn>
        </>
      ) : null}
      {manage && menuItem ? (
        <MenuBtn pad={pad} icon={<Link2 className="h-4 w-4" />} onClick={onShare}>
          Ссылка…
        </MenuBtn>
      ) : null}
      {manage && menuItem && onAccess ? (
        <MenuBtn pad={pad} icon={<Lock className="h-4 w-4" />} onClick={onAccess}>
          Доступ…
        </MenuBtn>
      ) : null}
      {canZip && ids.length ? (
        <MenuBtn pad={pad} icon={<Download className="h-4 w-4" />} href={zipHref} onClick={onZip}>
          Скачать zip
        </MenuBtn>
      ) : null}
      {manage ? (
        <MenuBtn pad={pad} icon={<Trash2 className="h-4 w-4" />} onClick={onDelete}>
          Удалить
        </MenuBtn>
      ) : null}
    </>
  );
}

function MenuBtn({
  icon,
  children,
  onClick,
  href,
  pad,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  pad?: boolean;
}) {
  const cls = `flex w-full items-center gap-2 px-4 text-left text-navy hover:bg-paper-2 ${pad ? "py-3 text-[15px]" : "px-3 py-1.5 text-sm"}`;
  if (href) {
    return (
      <a href={href} className={cls} onClick={onClick}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui";
import { Link2 } from "lucide-react";

export type ShareState = {
  enabled: boolean;
  token: string;
  download: boolean;
  edit: boolean;
  create: boolean;
};

export function ShareDialog({
  itemId,
  title,
  initial,
  onClose,
  onSaved,
}: {
  itemId: string;
  title: string;
  initial: ShareState;
  onClose: () => void;
  onSaved?: (s: ShareState) => void;
}) {
  const [download, setDownload] = useState(initial.download);
  const [edit, setEdit] = useState(initial.edit);
  const [create, setCreate] = useState(initial.create);
  const [enabled, setEnabled] = useState(initial.enabled);
  const [token, setToken] = useState(initial.token);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const urlBox = useRef<HTMLInputElement>(null);

  function urlOf(t: string) {
    return `${window.location.origin}/l/${t}`;
  }

  async function save(nextEnabled: boolean) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/library/${itemId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled, download, edit, create }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось сохранить");
      return;
    }
    const st: ShareState = {
      enabled: Boolean(data.shareEnabled),
      token: data.shareToken || "",
      download: data.shareDownload !== false,
      edit: Boolean(data.shareEdit),
      create: Boolean(data.shareCreate),
    };
    setEnabled(st.enabled);
    setToken(st.token);
    onSaved?.(st);
  }

  async function copy() {
    if (!token) return;
    const url = urlOf(token);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
        return;
      }
    } catch {
      /* HTTP LAN is not a secure context */
    }
    const el = urlBox.current;
    if (el) {
      el.focus();
      el.select();
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-3xl border border-line bg-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow)] sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-navy">
          <Link2 className="h-5 w-5" />
          <h2 className="font-serif text-xl">Ссылка · {title}</h2>
        </div>
        <p className="mt-1 text-sm text-muted">Кто откроет ссылку без учётки студии.</p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked disabled className="mt-0.5" />
          <span>
            <span className="font-semibold">Смотреть</span>
            <span className="block text-muted">Всегда, пока ссылка включена</span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={download} onChange={(e) => setDownload(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-semibold">Скачивать</span>
            <span className="block text-muted">Файлы и zip папки</span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={edit} onChange={(e) => setEdit(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-semibold">Редактировать</span>
            <span className="block text-muted">Переименовать, перенести, копировать</span>
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} className="mt-0.5" />
          <span>
            <span className="font-semibold">Создавать папки</span>
            <span className="block text-muted">Новые папки внутри этой ссылки</span>
          </span>
        </label>
        {enabled && token ? (
          <input
            ref={urlBox}
            readOnly
            value={urlOf(token)}
            className="mt-4 w-full break-all rounded-xl bg-paper px-3 py-2 text-xs text-navy"
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : null}
        {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={() => void save(true)}>
            {enabled ? "Сохранить права" : "Включить ссылку"}
          </Button>
          {enabled && token ? (
            <Button type="button" variant="secondary" onClick={() => void copy()}>
              {copied ? "Скопировано" : "Копировать URL"}
            </Button>
          ) : null}
          {enabled ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(false)}>
              Выключить
            </Button>
          ) : null}
          <Button type="button" variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
      </div>
    </div>
  );
}

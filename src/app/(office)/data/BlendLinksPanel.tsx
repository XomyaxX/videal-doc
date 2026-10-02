"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FolderOpen, Link2, RefreshCw, Upload } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ProgressBar } from "@/components/ProgressBar";
import type { BlendLink, BlendLinksInfo } from "@/lib/blend-links-types";
import { downloadRelatedZip, pickRelatedZipSave, type RelatedZipProgress } from "@/lib/related-zip-download";
import { dataFileUrl, dataPageHref, dataViewHref } from "@/lib/share-data-href";
import { RelatedRestoreModal } from "./RelatedRestoreModal";

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1)} МБ`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

const KIND_LABEL: Record<BlendLink["kind"], string> = {
  library: "Link / Append",
  dir: "Папка",
  image: "Текстура",
  file: "Файл",
  note: "Описание",
};

function hrefOf(row: BlendLink) {
  return row.kind === "dir" ? dataPageHref(row.rel) : dataViewHref(row.rel);
}

function isAbortError(e: unknown) {
  return (e instanceof DOMException || e instanceof Error) && e.name === "AbortError";
}

export function BlendLinksPanel({
  rel,
  isBlend,
  initial,
  canWork = false,
}: {
  rel: string;
  isBlend: boolean;
  initial: BlendLinksInfo | null;
  canWork?: boolean;
}) {
  const router = useRouter();
  const [info, setInfo] = useState<BlendLinksInfo | null>(initial);
  const [busy, setBusy] = useState(Boolean(isBlend && initial?.pending));
  const [error, setError] = useState("");
  const [restore, setRestore] = useState(false);
  const [dl, setDl] = useState<RelatedZipProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const downloading = Boolean(dl && dl.phase !== "done");

  async function onDownload() {
    if (downloading) return;
    setError("");
    const suggested = `${(rel.split("/").pop() || "blend").replace(/\.blend$/i, "")}-связанное.zip`;
    let writable = null;
    try {
      writable = await pickRelatedZipSave(suggested);
    } catch (e) {
      if (isAbortError(e)) return;
      writable = null;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    setDl({ pct: 0, loaded: 0, total: info?.zipBytes || 0, phase: "prepare" });
    try {
      await downloadRelatedZip({
        rel,
        estimate: info?.zipBytes,
        suggestedName: suggested,
        writable,
        signal: ac.signal,
        onProgress: setDl,
      });
    } catch (e) {
      if (isAbortError(e) || ac.signal.aborted) {
        setDl(null);
        return;
      }
      setError(e instanceof Error ? e.message : "Не удалось скачать");
      setDl(null);
    }
  }

  function onCancelDownload() {
    abortRef.current?.abort();
  }

  function load(refresh = false) {
    if (!isBlend) return;
    setBusy(true);
    setError("");
    const q = new URLSearchParams({ p: rel });
    if (refresh) q.set("refresh", "1");
    void fetch(`/api/data/links?${q.toString()}`, { credentials: "same-origin" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as BlendLinksInfo & { error?: string };
        if (!res.ok) throw new Error(data.error || "Не удалось прочитать связи");
        setInfo(data);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Не удалось прочитать связи");
      })
      .finally(() => setBusy(false));
  }

  useEffect(() => {
    if (isBlend && (initial?.pending || !initial)) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  const notes = info?.notes || [];
  const links = info?.links || [];
  const groups: BlendLink["kind"][] = ["library", "dir", "image", "file", "note"];

  return (
    <div className="mt-4 space-y-4">
      {notes.map((note) => (
        <Card key={note.rel}>
          <p className="mb-2 text-sm font-semibold text-navy">Описание · {note.name}</p>
          <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-navy">{note.text}</pre>
        </Card>
      ))}
      {isBlend ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-serif text-xl text-navy">
              <Link2 className="h-5 w-5" />
              Связанные файлы
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="gold" disabled={downloading} onClick={() => void onDownload()}>
                <Download className="h-4 w-4" />
                {downloading ? "Скачиваю…" : "Скачать всё связанное"}
              </Button>
              {downloading ? (
                <Button type="button" variant="secondary" onClick={onCancelDownload}>
                  Отменить
                </Button>
              ) : null}
              {canWork ? (
                <Button type="button" variant="secondary" onClick={() => setRestore(true)}>
                  <Upload className="h-4 w-4" />
                  Вернуть архив
                </Button>
              ) : null}
              <Button type="button" variant="secondary" disabled={busy} onClick={() => load(true)}>
                <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
                {busy ? "Читаю .blend…" : "Обновить связи"}
              </Button>
            </div>
          </div>
          {busy && !links.length ? (
            <p className="text-sm text-muted">Читаю Link / Append из файла. Первый раз может занять полминуты.</p>
          ) : null}
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          {dl ? (
            <div className="mt-3">
              <ProgressBar
                value={dl.pct}
                label={dl.label || (dl.phase === "prepare" ? "Собираю архив…" : dl.phase === "done" ? "Готово" : "Скачиваю")}
                hint={
                  dl.loaded
                    ? `${formatBytes(dl.loaded)}${dl.total ? ` из ${formatBytes(dl.total)}` : ""}`
                    : info?.zipBytes
                      ? `около ${formatBytes(info.zipBytes)}`
                      : ""
                }
                size="lg"
              />
            </div>
          ) : null}
          {info && !links.length && !busy ? (
            <p className="text-sm text-muted">В файле нет путей Link / Append внутри папки Data.</p>
          ) : null}
          {groups.map((kind) => {
            const rows = links.filter((l) => l.kind === kind);
            if (!rows.length) return null;
            return (
              <div key={kind} className="mt-3">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{KIND_LABEL[kind]}</p>
                <ul className="divide-y divide-line rounded-xl border border-line bg-white">
                  {rows.map((row) => (
                    <li key={row.rel} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <a href={hrefOf(row)} className={`min-w-0 break-all font-medium ${row.exists ? "text-navy underline" : "text-muted"}`}>
                        {row.kind === "dir" ? <FolderOpen className="mr-1 inline h-4 w-4" /> : null}
                        {row.rel}
                      </a>
                      <span className="flex items-center gap-2 text-xs text-muted">
                        {row.exists ? (row.size ? formatBytes(row.size) : "") : "нет на диске"}
                        {row.exists && row.kind !== "dir" ? (
                          <a href={dataFileUrl(row.rel, { dl: true })} className="font-semibold text-navy underline">
                            скачать
                          </a>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {info?.zipCount ? (
            <p className="mt-3 text-xs text-muted">
              В архив попадёт {info.zipCount} файл{info.zipCount === 1 ? "" : "ов"}
              {info.zipBytes ? ` · ${formatBytes(info.zipBytes)}` : ""}
              {info.zipCapped
                ? ". Крупные последовательности и отсутствующие пути в архив не входят — их можно скачать по ссылкам."
                : "."}{" "}
              Внутри .blend пути станут относительными, чтобы архив открывался на ноутбуке. Тот же zip верните сюда —
              пути снова станут студийными.
            </p>
          ) : null}
        </Card>
      ) : null}
      {restore ? (
        <RelatedRestoreModal
          rootRel={rel}
          onClose={() => setRestore(false)}
          onDone={() => {
            router.refresh();
            load(true);
          }}
        />
      ) : null}
    </div>
  );
}

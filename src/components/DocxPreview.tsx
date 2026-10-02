"use client";

import { useEffect, useRef, useState } from "react";

function fitDocx(host: HTMLElement) {
  const wrap = host.querySelector<HTMLElement>(".docx-wrapper");
  if (!wrap) return;
  wrap.style.transform = "none";
  wrap.style.marginBottom = "0px";
  const page = wrap.querySelector<HTMLElement>("section.docx");
  const pageW = page?.offsetWidth || wrap.scrollWidth;
  if (!pageW) return;
  const avail = Math.max(120, host.clientWidth - 16);
  const scale = Math.min(1, avail / pageW);
  wrap.style.transformOrigin = "top center";
  wrap.style.transform = `scale(${scale})`;
  wrap.style.marginBottom = `${-((wrap.scrollHeight || 0) * (1 - scale))}px`;
}

export function DocxPreview({
  src,
  compact,
  className = "",
}: {
  src: string;
  compact?: boolean;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let gone = false;
    let ro: ResizeObserver | null = null;
    const el = host.current;
    if (el) el.innerHTML = "";
    setError("");
    void (async () => {
      try {
        const res = await fetch(src, { credentials: "same-origin" });
        if (!res.ok) throw new Error("Не удалось открыть файл");
        const buf = await res.arrayBuffer();
        const { renderAsync } = await import("docx-preview");
        if (gone || !host.current) return;
        await renderAsync(buf, host.current, undefined, {
          className: "vd-docx",
          inWrapper: true,
          breakPages: !compact,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
        });
        if (gone || !host.current) return;
        const box = host.current;
        fitDocx(box);
        ro = new ResizeObserver(() => fitDocx(box));
        ro.observe(box);
      } catch (e) {
        if (!gone) setError(e instanceof Error ? e.message : "Не удалось показать Word");
      }
    })();
    return () => {
      gone = true;
      ro?.disconnect();
    };
  }, [src, compact]);

  return (
    <div className={`max-w-full overflow-hidden rounded-xl bg-[#ece7de] ${className}`}>
      <style>{`
        .vd-docx-host { max-width: 100%; }
        .vd-docx-host .docx-wrapper { background: transparent; padding: 8px 0; }
        .vd-docx-host section.docx { background: #fff; box-shadow: 0 1px 6px rgba(26,43,74,.12); margin: 0 auto 12px; }
      `}</style>
      {error ? (
        <p className="px-6 py-10 text-center text-sm text-muted">
          {error}.{" "}
          <a href={src} className="font-semibold text-navy underline">
            Скачать
          </a>
        </p>
      ) : null}
      <div
        ref={host}
        className={`vd-docx-host overflow-auto ${compact ? "max-h-56 p-2" : className ? "h-full min-h-0 p-3" : "h-[85vh] p-3"}`}
      />
    </div>
  );
}

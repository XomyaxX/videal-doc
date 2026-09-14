"use client";

import { useEffect, useState } from "react";

function loadViewer() {
  if (typeof document === "undefined") return;
  if (document.querySelector("script[data-model-viewer]")) return;
  const s = document.createElement("script");
  s.type = "module";
  s.src = "/vendor/model-viewer.min.js";
  s.dataset.modelViewer = "1";
  document.head.appendChild(s);
}

export function GlbPreview({
  src,
  compact,
  tall,
  className,
}: {
  src: string;
  compact?: boolean;
  tall?: boolean;
  className?: string;
}) {
  const [ok, setOk] = useState(false);
  const [fail, setFail] = useState(false);
  useEffect(() => {
    let n = 0;
    let timer = 0;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const res = await fetch(src, { method: "GET", cache: "no-store" });
        const ct = res.headers.get("content-type") || "";
        if (res.status === 200 && ct.includes("gltf")) {
          setOk(true);
          return;
        }
      } catch {
        /* wait */
      }
      n += 1;
      if (n >= 40) {
        setFail(true);
        return;
      }
      timer = window.setTimeout(() => void tick(), 3000);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [src]);
  if (ok) return <ModelPreview src={src} compact={compact} tall={tall} className={className} />;
  if (fail) {
    return <p className="px-3 py-6 text-center text-sm text-muted">Превью не собралось. Файл можно скачать исходником.</p>;
  }
  return <p className="px-3 py-6 text-center text-sm text-muted">Готовим 3D-превью… можно подождать или обновить чат.</p>;
}

export function ModelPreview({
  src,
  className = "",
  tall,
  compact,
}: {
  src: string;
  className?: string;
  tall?: boolean;
  compact?: boolean;
}) {
  useEffect(() => {
    loadViewer();
  }, []);
  const h = tall ? "100%" : compact ? "16rem" : "22rem";
  return (
    <model-viewer
      src={src}
      alt="3D модель"
      camera-controls
      touch-action="pan-y"
      auto-rotate
      shadow-intensity="1"
      className={className}
      style={{
        display: "block",
        width: "100%",
        height: h,
        minHeight: tall ? "80vh" : h,
        background: "#152033",
      }}
    />
  );
}

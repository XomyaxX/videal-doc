"use client";

import { useEffect, useRef, useState } from "react";

type Media = { kind: "video" | "image"; name: string; v: number };

const CSS = `
html, body { margin: 0; background: #16324f; }
.vd-gate {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  background: #16324f;
  color: #ffffff;
  font-family: Arial, Helvetica, sans-serif;
}
.vd-gate-media, .vd-gate-media img, .vd-gate-media video {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 0;
}
.vd-gate-media img, .vd-gate-media video { object-fit: cover; }
.vd-gate-side {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 42%;
  background: #16324f;
  background: rgba(22, 50, 79, 0.88);
  text-align: center;
}
.vd-gate-mid { display: table; width: 100%; height: 100%; }
.vd-gate-cell { display: table-cell; vertical-align: middle; padding: 28px 20px; }
.vd-gate-clock {
  margin: 0;
  font-size: 72px;
  line-height: 1;
  font-weight: 700;
}
.vd-gate-caption { margin: 16px 8px 0; font-size: 24px; line-height: 1.35; }
.vd-gate-qrbox {
  width: 78%;
  margin: 20px auto 0;
  background: #ffffff;
  padding: 12px;
}
.vd-gate-qrbox img {
  display: block;
  width: 100% !important;
  height: auto !important;
  max-width: 100%;
  border: 0;
}
.vd-gate-note { margin: 18px 8px 0; font-size: 16px; line-height: 1.4; color: #d5deea; }
.vd-gate-wait { margin: 24px 12px 0; font-size: 22px; line-height: 1.4; }
`;

export function GateBoard({ kioskKey = "" }: { kioskKey?: string }) {
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState("");
  const [media, setMedia] = useState<Media | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boardUrl = kioskKey ? `/api/gate/board?k=${encodeURIComponent(kioskKey)}` : "/api/qr/board";
  const src = media
    ? kioskKey
      ? `/api/gate/media?k=${encodeURIComponent(kioskKey)}&v=${media.v}`
      : `/api/qr/media?v=${media.v}`
    : "";

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(boardUrl, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (stop) return;
      if (!res.ok || !data.qr) {
        setQr("");
        setMedia(null);
        setError(data.error || "Нет доступа к экрану");
        return;
      }
      setError("");
      setQr(data.qr);
      const next = data.media;
      setMedia(next && (next.kind === "video" || next.kind === "image") ? next : null);
    }
    void load();
    const refresh = setInterval(() => void load(), 60_000);
    const tick = setInterval(() => {
      setClock(
        new Date().toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Omsk",
        }),
      );
    }, 1000);
    return () => {
      stop = true;
      clearInterval(refresh);
      clearInterval(tick);
    };
  }, [boardUrl]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    void el.play().catch(() => null);
  }, [src]);

  return (
    <main className="vd-gate">
      <style>{CSS}</style>
      {src && media?.kind === "video" ? (
        <div className="vd-gate-media">
          <video ref={videoRef} key={src} src={src} autoPlay muted loop playsInline preload="auto" />
        </div>
      ) : null}
      {src && media?.kind === "image" ? (
        <div className="vd-gate-media">
          <img key={src} src={src} alt="" />
        </div>
      ) : null}
      <section className="vd-gate-side">
        <div className="vd-gate-mid">
          <div className="vd-gate-cell">
            <p className="vd-gate-clock">{clock || "—"}</p>
            <p className="vd-gate-caption">Отсканируйте, чтобы отметить приход или уход</p>
            {qr ? (
              <div className="vd-gate-qrbox">
                <img src={qr} width={640} height={640} alt="QR для отметки прихода и ухода" />
              </div>
            ) : (
              <p className="vd-gate-wait">{error || "Готовим код…"}</p>
            )}
            <p className="vd-gate-note">Код меняется каждые два часа. Время — Омск.</p>
          </div>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";

export function CameraAttach({ onCapture }: { onCapture: (file: File) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const camFileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState("");

  function stop() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLive(false);
  }

  useEffect(() => () => stop(), []);

  useEffect(() => {
    if (!live || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    void videoRef.current.play().catch(() => {});
  }, [live]);

  async function start() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setLive(true);
    } catch {
      setError("Камера недоступна — можно снять через кнопку телефона или выбрать файл.");
      camFileRef.current?.click();
    }
  }

  function snap() {
    const video = videoRef.current;
    if (!video || video.videoWidth < 8) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const name = `photo-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.jpg`;
        onCapture(new File([blob], name, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => (live ? stop() : void start())}>
          {live ? "Закрыть камеру" : "Камера на сайте"}
        </Button>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-[15px] font-semibold text-navy hover:bg-paper"
          onClick={() => camFileRef.current?.click()}
        >
          Камера телефона
        </button>
        <input
          ref={camFileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCapture(f);
            e.target.value = "";
          }}
        />
      </div>
      {error ? <p className="text-sm text-muted">{error}</p> : null}
      {live ? (
        <div className="space-y-2">
          <video ref={videoRef} className="max-h-64 w-full rounded-xl bg-navy object-cover" playsInline muted />
          <Button type="button" variant="gold" onClick={snap}>
            Сфотографировать
          </Button>
        </div>
      ) : null}
    </div>
  );
}

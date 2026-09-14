"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Pause, Play } from "lucide-react";
import { formatVoiceTime } from "@/lib/chat-media";

const peakCache = new Map<string, number[]>();

async function peaksFor(src: string, n = 36): Promise<number[]> {
  const hit = peakCache.get(src);
  if (hit) return hit;
  const buf = await fetch(src).then((r) => r.arrayBuffer());
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return Array(n).fill(0.3);
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(buf.slice(0));
    const data = audio.getChannelData(0);
    const block = Math.max(1, Math.floor(data.length / n));
    const peaks: number[] = [];
    for (let i = 0; i < n; i++) {
      let max = 0;
      const start = i * block;
      for (let j = 0; j < block; j += 8) max = Math.max(max, Math.abs(data[start + j] || 0));
      peaks.push(max);
    }
    const hi = Math.max(...peaks, 0.08);
    const norm = peaks.map((p) => Math.max(0.12, p / hi));
    peakCache.set(src, norm);
    return norm;
  } catch {
    const fallback = Array(n).fill(0.3);
    peakCache.set(src, fallback);
    return fallback;
  } finally {
    void ctx.close().catch(() => {});
  }
}

const SPEEDS = [1, 1.5, 2];

export function VoicePlayer({
  src,
  durationMs,
  text,
}: {
  src: string;
  durationMs: number;
  text?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(durationMs / 1000);
  const [speed, setSpeed] = useState(1);
  const [peaks, setPeaks] = useState<number[]>(() => Array(36).fill(0.28));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    void peaksFor(src).then((p) => {
      if (live) setPeaks(p);
    });
    return () => {
      live = false;
    };
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  const progress = dur > 0 ? Math.min(1, cur / dur) : 0;
  const hasText = Boolean(text && text.trim());

  return (
    <div className="min-w-[220px]">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDur(d);
        }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy text-white"
          onClick={() => {
            const el = audioRef.current;
            if (!el) return;
            if (el.paused) void el.play();
            else el.pause();
          }}
          aria-label={playing ? "Пауза" : "Слушать"}
        >
          {playing ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>
        <button
          type="button"
          className="flex h-8 min-w-0 flex-1 items-end gap-[2px]"
          title="Перемотать"
          onClick={(e) => {
            const el = audioRef.current;
            if (!el || !dur) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            el.currentTime = Math.max(0, Math.min(dur, x * dur));
          }}
        >
          {peaks.map((h, i) => {
            const at = (i + 0.5) / peaks.length;
            return (
              <span
                key={i}
                className={`w-[3px] rounded-full ${at <= progress ? "bg-gold" : "bg-navy/30"}`}
                style={{ height: `${Math.round(h * 28)}px` }}
              />
            );
          })}
        </button>
        <span className="w-8 shrink-0 text-[11px] tabular-nums text-muted">{formatVoiceTime((dur - cur) * 1000)}</span>
        <button
          type="button"
          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-navy hover:bg-white"
          onClick={() => {
            const i = SPEEDS.indexOf(speed);
            const next = SPEEDS[(i + 1) % SPEEDS.length];
            setSpeed(next);
          }}
        >
          {speed}×
        </button>
      </div>
      {hasText ? (
        <div className="mt-1">
          <button
            type="button"
            className="flex items-center gap-1 text-[11px] font-semibold text-navy"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown size={12} className={open ? "rotate-180" : ""} />
            {open ? "Скрыть текст" : "Раскрыть расшифровку"}
          </button>
          {open ? <p className="mt-1 whitespace-pre-wrap text-sm text-navy">{text}</p> : null}
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted">Нет расшифровки</p>
      )}
    </div>
  );
}

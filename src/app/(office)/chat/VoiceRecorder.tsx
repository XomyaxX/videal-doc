"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Lock, Mic, Send, Trash2 } from "lucide-react";
import { formatVoiceTime } from "@/lib/chat-media";

export type VoiceTake = { blob: Blob; mime: string; durationMs: number; text: string };

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function speechCtor(): (new () => SpeechRec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return "";
}

const MIN_MS = 500;
const SLIDE = 64;

export function VoiceRecorder({
  disabled,
  hideMic,
  onSend,
  onError,
  onActive,
}: {
  disabled?: boolean;
  hideMic?: boolean;
  onSend: (take: VoiceTake) => void | Promise<void>;
  onError: (msg: string) => void;
  onActive?: (on: boolean) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "hold" | "lock">("idle");
  const [hint, setHint] = useState<"none" | "cancel" | "lock">("none");
  const [ms, setMs] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array(24).fill(0.12));
  const [liveText, setLiveText] = useState("");
  const [sttOk, setSttOk] = useState<boolean | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const hintRef = useRef(hint);
  hintRef.current = hint;

  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const speechRef = useRef<SpeechRec | null>(null);
  const finalText = useRef("");
  const interimText = useRef("");
  const committedText = useRef("");
  const wantSpeech = useRef(false);
  const speechTimer = useRef(0);
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);
  const tick = useRef(0);
  const cancelled = useRef(false);
  const onSendRef = useRef(onSend);
  const onErrorRef = useRef(onError);
  const onActiveRef = useRef(onActive);
  onSendRef.current = onSend;
  onErrorRef.current = onError;
  onActiveRef.current = onActive;

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    wantSpeech.current = false;
    if (speechTimer.current) window.clearTimeout(speechTimer.current);
    speechTimer.current = 0;
    try {
      speechRef.current?.abort();
    } catch {
      /* ignore */
    }
    speechRef.current = null;
    if (tick.current) window.clearInterval(tick.current);
    tick.current = 0;
  }, []);

  const finish = useCallback(
    (mode: "send" | "drop") => {
      const rec = recRef.current;
      recRef.current = null;
      const mime = rec?.mimeType || "audio/webm";
      const dur = Date.now() - started.current;
      const text = [finalText.current, interimText.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const send = mode === "send" && dur >= MIN_MS;
      if (rec && rec.state !== "inactive") {
        rec.onstop = () => {
          stopTracks();
          const blob = new Blob(chunks.current, { type: mime });
          chunks.current = [];
          if (send && blob.size > 64) void onSendRef.current({ blob, mime, durationMs: dur, text });
        };
        rec.stop();
      } else {
        stopTracks();
        chunks.current = [];
      }
      setPhase("idle");
      setHint("none");
      setMs(0);
      setLiveText("");
      setBars(Array(24).fill(0.12));
      onActiveRef.current?.(false);
    },
    [stopTracks],
  );

  useEffect(() => {
    return () => {
      try {
        recRef.current?.stop();
      } catch {
        /* ignore */
      }
      stopTracks();
    };
  }, [stopTracks]);

  useEffect(() => {
    function move(e: PointerEvent) {
      if (phaseRef.current !== "hold" || !pointer.current || e.pointerId !== pointer.current.id) return;
      const dx = e.clientX - pointer.current.x;
      const dy = e.clientY - pointer.current.y;
      if (dx < -SLIDE) setHint("cancel");
      else if (dy < -SLIDE) setHint("lock");
      else setHint("none");
    }
    function up(e: PointerEvent) {
      if (!pointer.current || e.pointerId !== pointer.current.id) return;
      pointer.current = null;
      if (phaseRef.current === "idle") {
        cancelled.current = true;
        return;
      }
      if (phaseRef.current === "lock") return;
      const h = hintRef.current;
      if (h === "cancel") finish("drop");
      else if (h === "lock") {
        setPhase("lock");
        setHint("none");
      } else finish("send");
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [finish]);

  async function startRec() {
    if (typeof MediaRecorder === "undefined") {
      onErrorRef.current("Браузер не пишет голос");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled.current) {
        stream.getTracks().forEach((t) => t.stop());
        cancelled.current = false;
        return;
      }
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      chunks.current = [];
      finalText.current = "";
      interimText.current = "";
      committedText.current = "";
      started.current = Date.now();
      rec.ondataavailable = (ev) => {
        if (ev.data.size) chunks.current.push(ev.data);
      };
      rec.start(200);
      recRef.current = rec;

      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ctx = new Ctx();
        audioCtx.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        src.connect(analyser);
        const data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        const loop = () => {
          analyser.getByteFrequencyData(data);
          const next: number[] = [];
          const step = Math.max(1, Math.floor(data.length / 24));
          for (let i = 0; i < 24; i++) {
            let s = 0;
            for (let j = 0; j < step; j++) s += data[i * step + j] || 0;
            next.push(Math.max(0.08, Math.min(1, s / step / 180)));
          }
          setBars(next);
          raf.current = requestAnimationFrame(loop);
        };
        raf.current = requestAnimationFrame(loop);
      }

      const Ctor = speechCtor();
      if (Ctor) {
        wantSpeech.current = true;
        const boot = () => {
          if (!wantSpeech.current) return;
          const sr = new Ctor();
          sr.lang = "ru-RU";
          sr.continuous = true;
          sr.interimResults = true;
          sr.onresult = (ev) => {
            let sessionFinal = "";
            let interim = "";
            for (let i = 0; i < ev.results.length; i++) {
              const t = ev.results[i][0]?.transcript || "";
              if (ev.results[i].isFinal) sessionFinal += `${t} `;
              else interim += t;
            }
            finalText.current = [committedText.current, sessionFinal].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
            interimText.current = interim.trim();
            setLiveText([finalText.current, interimText.current].filter(Boolean).join(" "));
          };
          sr.onerror = (ev) => {
            const err = String(ev.error || "");
            if (err === "not-allowed" || err === "service-not-allowed") {
              wantSpeech.current = false;
              setSttOk(false);
            }
          };
          sr.onend = () => {
            committedText.current = [finalText.current, interimText.current].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
            finalText.current = committedText.current;
            interimText.current = "";
            setLiveText(committedText.current);
            if (!wantSpeech.current) return;
            if (speechTimer.current) window.clearTimeout(speechTimer.current);
            speechTimer.current = window.setTimeout(() => {
              if (wantSpeech.current) boot();
            }, 160);
          };
          try {
            sr.start();
            speechRef.current = sr;
            setSttOk(true);
          } catch {
            if (wantSpeech.current) speechTimer.current = window.setTimeout(() => boot(), 400);
            else setSttOk(false);
          }
        };
        boot();
      } else {
        setSttOk(false);
      }

      tick.current = window.setInterval(() => setMs(Date.now() - started.current), 200);
      if (cancelled.current) {
        cancelled.current = false;
        finish("drop");
        return;
      }
      setPhase("hold");
      setMs(0);
      onActiveRef.current?.(true);
    } catch {
      stopTracks();
      onErrorRef.current("Нет доступа к микрофону");
      setPhase("idle");
      onActiveRef.current?.(false);
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || phase !== "idle") return;
    e.preventDefault();
    cancelled.current = false;
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    void startRec();
  }

  const recording = phase !== "idle";
  if (hideMic && !recording) return null;
  const danger = hint === "cancel";

  return (
    <>
      {recording ? (
        <div className={`flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1 ${danger ? "bg-bad/10" : "bg-paper"}`}>
          <button
            type="button"
            className="rounded-lg p-2 text-bad hover:bg-white"
            title="Отменить"
            onClick={() => finish("drop")}
          >
            <Trash2 size={16} />
          </button>
          <span className="w-10 shrink-0 text-xs font-semibold tabular-nums text-navy">{formatVoiceTime(ms)}</span>
          <div className="flex h-8 min-w-0 flex-1 items-end gap-[2px]">
            {bars.map((h, i) => (
              <span
                key={i}
                className={`w-[3px] rounded-full ${danger ? "bg-bad" : "bg-navy"}`}
                style={{ height: `${Math.round(h * 100)}%` }}
              />
            ))}
          </div>
          {phase === "lock" ? (
            <button
              type="button"
              className="rounded-xl bg-navy p-2 text-white"
              title="Отправить"
              onClick={() => finish("send")}
            >
              <Send size={16} />
            </button>
          ) : (
            <span className="hidden shrink-0 text-[11px] text-muted sm:block">
              {danger ? "Отпустите — отмена" : hint === "lock" ? "Отпустите — замок" : "Влево отмена · вверх замок"}
            </span>
          )}
          {phase !== "lock" ? (
            <span className={`rounded-lg p-2 ${hint === "lock" ? "text-gold" : "text-muted"}`} title="Замок">
              <Lock size={14} />
            </span>
          ) : null}
        </div>
      ) : null}
      {recording && (liveText || sttOk === false) ? (
        <p className="absolute bottom-full left-12 right-3 mb-1 max-h-16 overflow-y-auto rounded-lg bg-white/90 px-2 py-1 text-[11px] text-muted">
          {sttOk === false ? "Расшифровка в этом браузере недоступна" : liveText}
        </p>
      ) : null}
      {!recording ? (
        <button
          type="button"
          disabled={disabled}
          className="rounded-xl p-2 hover:bg-paper disabled:opacity-50"
          title="Голос. Зажмите, чтобы записать"
          style={{ touchAction: "none" }}
          onPointerDown={onPointerDown}
        >
          <Mic size={18} />
        </button>
      ) : null}
    </>
  );
}

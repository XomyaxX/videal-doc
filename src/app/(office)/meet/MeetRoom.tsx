"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize, MessageCircle, Mic, MicOff, Minimize, MonitorUp, PhoneOff, Rows3, Video, VideoOff } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { MeetDto } from "./MeetView";
import { MeetFileGrid } from "./MeetFiles";
import { MeetChat } from "./MeetChat";

type PeerInfo = { id: string; fullName: string; photoFileId: string; audioOn: boolean; videoOn: boolean; screenOn: boolean };

const STUN: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function Tile({
  stream,
  name,
  self,
  videoOn,
  muted,
  sharing,
  large,
}: {
  stream: MediaStream | null;
  name: string;
  self?: boolean;
  videoOn?: boolean;
  muted?: boolean;
  sharing?: boolean;
  large?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  const showVideo = Boolean(stream && videoOn !== false);
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-navy/80 ${large ? "min-h-[240px] md:min-h-0 md:h-full" : "min-h-[120px]"}`}>
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted || self}
        className={`h-full w-full ${sharing || large ? "object-contain bg-black" : "object-cover"} ${showVideo ? "" : "opacity-0"}`}
      />
      {!showVideo ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-white/10 px-3 py-2 text-sm text-white">{name}</span>
        </div>
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">
        {name}
        {self ? " · вы" : ""}
        {sharing ? " · экран" : ""}
      </span>
    </div>
  );
}

export function MeetRoom({ meet, meId, hangupHref }: { meet: MeetDto; meId: string; hangupHref?: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [consent, setConsent] = useState(!meet.recordConsent);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [screen, setScreen] = useState(false);
  const [large, setLarge] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [lanFail, setLanFail] = useState(false);
  const [iceReady, setIceReady] = useState(false);
  const [err, setErr] = useState("");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const localRef = useRef<MediaStream | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const making = useRef(new Map<string, boolean>());
  const after = useRef("");
  const peerRev = useRef("");
  const wrap = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isFull, setIsFull] = useState(false);
  const [wantRec, setWantRec] = useState(Boolean(meet.canHost));
  const [recOn, setRecOn] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recFail, setRecFail] = useState("");
  const iceRef = useRef<RTCConfiguration>(STUN);
  const iceWait = useRef<Promise<void> | null>(null);
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const iceRestarted = useRef(new Set<string>());
  const flushLock = useRef(false);
  const recCtx = useRef<AudioContext | null>(null);
  const recDest = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recOthers = useRef<GainNode | null>(null);
  const recMerger = useRef<ChannelMergerNode | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const mixed = useRef(new Set<string>());
  const trackRecs = useRef(new Map<string, { name: string; mr: MediaRecorder; chunks: Blob[] }>());
  const mimeRec = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";

  function startTrackRec(id: string, stream: MediaStream, name: string) {
    if (!meet.canHost || !wantRec || trackRecs.current.has(id)) return;
    const aud = stream.getAudioTracks();
    if (!aud.length) return;
    try {
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(new MediaStream(aud), { mimeType: mimeRec });
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.start(3000);
      trackRecs.current.set(id, { name, mr, chunks });
    } catch {
      /* браузер не пишет этот поток */
    }
  }

  function mixStream(id: string, stream: MediaStream) {
    if (!meet.canHost || !recCtx.current || !recMerger.current) return;
    const tracks = stream.getAudioTracks();
    if (!tracks.length || mixed.current.has(id)) return;
    mixed.current.add(id);
    try {
      const src = recCtx.current.createMediaStreamSource(new MediaStream(tracks));
      if (id === "local") src.connect(recMerger.current, 0, 0);
      else if (recOthers.current) src.connect(recOthers.current);
    } catch {
      mixed.current.delete(id);
    }
  }

  function startMixer() {
    if (!meet.canHost || recCtx.current) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const merger = ctx.createChannelMerger(2);
    const others = ctx.createGain();
    const dest = ctx.createMediaStreamDestination();
    others.connect(merger, 0, 1);
    merger.connect(dest);
    recCtx.current = ctx;
    recDest.current = dest;
    recMerger.current = merger;
    recOthers.current = others;
    if (localRef.current?.getAudioTracks().length) {
      mixStream("local", localRef.current);
      startTrackRec("local", localRef.current, meet.myName || "Организатор");
    }
    Object.entries(remote).forEach(([id, s]) => {
      mixStream(id, s);
      const who = peers.find((p) => p.id === id)?.fullName || "Участник";
      startTrackRec(id, s, who);
    });
  }

  function startRec() {
    if (!meet.canHost || !wantRec || rec.current) return;
    startMixer();
    void recCtx.current?.resume();
    const dest = recDest.current;
    if (!dest) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    recChunks.current = [];
    const mr = new MediaRecorder(dest.stream, { mimeType: mime });
    mr.ondataavailable = (e) => {
      if (e.data.size) recChunks.current.push(e.data);
    };
    mr.start(3000);
    rec.current = mr;
    setRecOn(true);
  }

  async function flushRec(opts?: { keepalive?: boolean }) {
    if (flushLock.current) return;
    const mr = rec.current;
    rec.current = null;
    setRecOn(false);
    if (!mr && !trackRecs.current.size) return;
    flushLock.current = true;
    if (mr && mr.state !== "inactive") {
      await new Promise<void>((resolve) => {
        mr.onstop = () => resolve();
        try {
          mr.stop();
        } catch {
          resolve();
        }
      });
    }
    const blob = new Blob(recChunks.current, { type: mr?.mimeType || "audio/webm" });
    recChunks.current = [];
    const tracks: { name: string; blob: Blob }[] = [];
    for (const tr of trackRecs.current.values()) {
      if (tr.mr.state !== "inactive") {
        await new Promise<void>((resolve) => {
          tr.mr.onstop = () => resolve();
          try {
            tr.mr.stop();
          } catch {
            resolve();
          }
        });
      }
      const b = new Blob(tr.chunks, { type: mimeRec });
      if (b.size >= 500) tracks.push({ name: tr.name, blob: b });
    }
    trackRecs.current.clear();
    if (blob.size < 2000 && !tracks.length) {
      flushLock.current = false;
      return;
    }
    setUploading(true);
    setRecFail("");
    try {
      const fd = new FormData();
      if (blob.size >= 2000) {
        fd.set("file", blob, "meeting.webm");
        fd.set("stereo", tracks.length >= 2 ? "0" : "1");
      }
      for (const t of tracks) {
        fd.append("track", t.blob, `${t.name}.webm`);
        fd.append("trackName", t.name);
      }
      const res = await fetch(`/api/meet/${meet.id}/recording`, { method: "POST", body: fd, keepalive: Boolean(opts?.keepalive) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error || `запись не ушла (${res.status})`;
        setRecFail(msg);
        setErr(`${msg}. Загрузите файл на карточке совещания.`);
      }
    } catch {
      setRecFail("запись не ушла");
      setErr("Запись не отправилась. Загрузите файл на карточке совещания.");
    }
    setUploading(false);
    try {
      await recCtx.current?.close();
    } catch {
      /* ignore */
    }
    recCtx.current = null;
    recDest.current = null;
    recMerger.current = null;
    recOthers.current = null;
    mixed.current.clear();
  }

  const postSignal = useCallback(
    (kind: string, toUserId: string, payload: unknown) => {
      void fetch(`/api/meet/${meet.id}/signal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, toUserId, payload: typeof payload === "string" ? payload : JSON.stringify(payload) }),
      });
    },
    [meet.id],
  );

  const heartbeat = useCallback(
    (extra?: { leave?: boolean; audioOn?: boolean; videoOn?: boolean; screenOn?: boolean }) => {
      void fetch(`/api/meet/${meet.id}/peers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leave: extra?.leave,
          audioOn: extra?.audioOn ?? mic,
          videoOn: extra?.videoOn ?? cam,
          screenOn: extra?.screenOn ?? screen,
        }),
      });
    },
    [meet.id, mic, cam, screen],
  );

  const drainIce = useCallback(async (peerId: string, pc: RTCPeerConnection) => {
    const queued = pendingIce.current.get(peerId) || [];
    pendingIce.current.delete(peerId);
    for (const c of queued) await pc.addIceCandidate(c).catch(() => {});
  }, []);

  const restartIce = useCallback(
    async (peerId: string, pc: RTCPeerConnection) => {
      if (iceRestarted.current.has(peerId)) {
        setLanFail(true);
        return;
      }
      iceRestarted.current.add(peerId);
      try {
        if (pc.signalingState !== "stable") {
          setLanFail(true);
          return;
        }
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        postSignal("offer", peerId, pc.localDescription);
      } catch {
        setLanFail(true);
      }
    },
    [postSignal],
  );

  const ensurePc = useCallback(
    async (peerId: string) => {
      const hit = pcs.current.get(peerId);
      if (hit) return hit;
      const pc = new RTCPeerConnection(iceRef.current);
      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) postSignal("ice", peerId, e.candidate);
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        setRemote((prev) => ({ ...prev, [peerId]: stream }));
        mixStream(peerId, stream);
        if (rec.current) {
          const who = peers.find((p) => p.id === peerId)?.fullName || "Участник";
          startTrackRec(peerId, stream, who);
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          iceRestarted.current.delete(peerId);
          setLanFail(false);
        } else if (pc.connectionState === "failed") {
          void restartIce(peerId, pc);
        }
      };
      pcs.current.set(peerId, pc);
      return pc;
    },
    [postSignal, restartIce],
  );

  const offerTo = useCallback(
    async (peerId: string) => {
      const pc = await ensurePc(peerId);
      if (pc.signalingState !== "stable") return;
      making.current.set(peerId, true);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        postSignal("offer", peerId, pc.localDescription);
      } finally {
        making.current.set(peerId, false);
      }
    },
    [ensurePc, postSignal],
  );

  const hangup = useCallback(
    async (end = false) => {
      if (meet.canHost) await flushRec();
      heartbeat({ leave: true });
      if (end && meet.canHost) {
        await fetch(`/api/meet/${meet.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "done" }),
        });
      }
      pcs.current.forEach((pc) => pc.close());
      pcs.current.clear();
      localRef.current?.getTracks().forEach((t) => t.stop());
      router.push(hangupHref || `/meet/${meet.id}`);
    },
    // flushRec is stable enough via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heartbeat, hangupHref, meet.canHost, meet.id, router],
  );

  async function startPreview() {
    setErr("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localRef.current = stream;
      camTrack.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localRef.current = stream;
        setLocalStream(stream);
        setCam(false);
      } catch {
        setErr("Нет доступа к микрофону или камере");
      }
    }
  }

  async function join() {
    if (meet.recordConsent && !consent) {
      setErr("Нужно согласие на запись");
      return;
    }
    if (!localRef.current) await startPreview();
    if (!localRef.current) return;
    const res = await fetch(`/api/meet/${meet.id}/peers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audioOn: mic, videoOn: cam, screenOn: false }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Нельзя войти");
      return;
    }
    if (iceWait.current) await iceWait.current;
    if (meet.canHost && meet.status === "scheduled") {
      await fetch(`/api/meet/${meet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      });
    }
    setReady(true);
    if (meet.canHost && wantRec) startRec();
  }

  useEffect(() => {
    iceWait.current = (async () => {
      try {
        const r = await fetch("/api/meet/ice");
        const d = await r.json();
        if (Array.isArray(d.iceServers) && d.iceServers.length) iceRef.current = { iceServers: d.iceServers };
      } catch {
        /* STUN already in iceRef */
      }
      setIceReady(true);
    })();
    const t = window.setTimeout(() => setIceReady(true), 2500);
    const onFs = () => setIsFull(Boolean(document.fullscreenElement));
    const onHide = () => {
      if (meet.canHost) void flushRec({ keepalive: true });
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("pagehide", onHide);
    void startPreview();
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("pagehide", onHide);
      if (meet.canHost) void flushRec({ keepalive: true });
      localRef.current?.getTracks().forEach((tr) => tr.stop());
      pcs.current.forEach((pc) => pc.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    for (const p of peers) {
      const tr = trackRecs.current.get(p.id);
      if (tr && p.fullName) tr.name = p.fullName;
    }
  }, [peers]);

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let inflight = false;
    async function tick() {
      if (stop || inflight) return;
      inflight = true;
      try {
      heartbeat();
      const pr = await fetch(`/api/meet/${meet.id}/peers?rev=${encodeURIComponent(peerRev.current)}`);
      const pd = await pr.json().catch(() => ({}));
      if (pd.rev) peerRev.current = String(pd.rev);
      let list: PeerInfo[] = [];
      if (!pd.unchanged) {
        list = (pd.peers || []).filter((p: PeerInfo) => p.id !== meId);
        setPeers(list);
      }
      if (pd.status === "done" || pd.status === "cancelled") {
        await hangup();
        return;
      }
      for (const p of list) {
        if (!pcs.current.has(p.id) && meId > p.id) void offerTo(p.id);
      }
      const qs = after.current ? `?after=${after.current}` : "";
      const sr = await fetch(`/api/meet/${meet.id}/signal${qs}`);
      const sd = await sr.json().catch(() => ({}));
      const sigs: { id: string; from: string; kind: string; payload: string }[] = sd.signals || [];
      for (const s of sigs) {
        after.current = s.id;
        if (s.kind === "bye" || s.kind === "leave") {
          pcs.current.get(s.from)?.close();
          pcs.current.delete(s.from);
          setRemote((prev) => {
            const n = { ...prev };
            delete n[s.from];
            return n;
          });
          continue;
        }
        let payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null = null;
        try {
          payload = JSON.parse(s.payload);
        } catch {
          continue;
        }
        if (s.kind === "offer") {
          const pc = await ensurePc(s.from);
          const glare = making.current.get(s.from) || pc.signalingState !== "stable";
          if (glare) {
            if (meId > s.from) continue;
            try {
              await pc.setLocalDescription({ type: "rollback" });
            } catch {
              /* ignore */
            }
          }
          await pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
          await drainIce(s.from, pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          postSignal("answer", s.from, pc.localDescription);
        } else if (s.kind === "answer") {
          const pc = pcs.current.get(s.from);
          if (pc && pc.signalingState !== "stable") {
            await pc.setRemoteDescription(payload as RTCSessionDescriptionInit).catch(() => {});
            await drainIce(s.from, pc);
          }
        } else if (s.kind === "ice") {
          const pc = await ensurePc(s.from);
          const cand = payload as RTCIceCandidateInit;
          if (!pc.remoteDescription) {
            const q = pendingIce.current.get(s.from) || [];
            q.push(cand);
            pendingIce.current.set(s.from, q);
          } else {
            await pc.addIceCandidate(cand).catch(() => {});
          }
        }
      }
      } finally {
        inflight = false;
      }
    }
    let timer = 0;
    async function loop() {
      if (stop) return;
      await tick();
      const live = [...pcs.current.values()].some((pc) => pc.connectionState === "connected");
      timer = window.setTimeout(() => void loop(), live ? 2000 : 800);
    }
    void loop();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [ready, meet.id, meId, heartbeat, offerTo, ensurePc, postSignal, hangup, drainIce]);

  function toggleMic() {
    const next = !mic;
    setMic(next);
    localRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = next;
    });
    heartbeat({ audioOn: next });
  }

  function toggleCam() {
    const next = !cam;
    setCam(next);
    localRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = next;
    });
    heartbeat({ videoOn: next });
  }

  async function toggleScreen() {
    if (screen) {
      if (camTrack.current) {
        for (const pc of pcs.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(camTrack.current);
        }
        const v = localRef.current?.getVideoTracks()[0];
        if (v && camTrack.current && v !== camTrack.current) {
          localRef.current?.removeTrack(v);
          v.stop();
          localRef.current?.addTrack(camTrack.current);
        }
      }
      setScreen(false);
      heartbeat({ screenOn: false });
      return;
    }
    try {
      const share = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const track = share.getVideoTracks()[0];
      if (!track) return;
      for (const pc of pcs.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      if (localRef.current) {
        localRef.current.getVideoTracks().forEach((t) => {
          if (t !== track) localRef.current?.removeTrack(t);
        });
        localRef.current.addTrack(track);
        setLocalStream(localRef.current);
      }
      track.onended = () => void toggleScreen();
      setScreen(true);
      setLarge(true);
      heartbeat({ screenOn: true });
    } catch {
      /* user cancel */
    }
  }

  async function full() {
    const el = wrap.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen().catch(() => {});
  }

  const sharer = screen ? meId : peers.find((p) => p.screenOn)?.id || "";
  const presenter = large && sharer ? sharer : "";
  const rest = peers.filter((p) => p.id !== presenter);

  return (
    <div ref={wrap} className="fixed inset-0 z-[60] flex flex-col bg-[#0e1c2c] text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-serif text-xl">{meet.title}</p>
          <p className="text-xs text-white/60">
            {ready ? "вы в эфире" : meet.place}
            {recOn ? " · пишем звук для сводки" : ""}
            {uploading ? " · отправляем запись…" : ""}
            {recFail ? " · запись не ушла, загрузите файл на карточке" : ""}
          </p>
        </div>
        <button type="button" className="text-sm text-white/70 underline" onClick={() => void hangup()}>
          К карточке
        </button>
      </header>

      {!ready ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-black">
            <video
              className="aspect-video w-full object-cover"
              autoPlay
              muted
              playsInline
              ref={(el) => {
                if (el) el.srcObject = localStream;
              }}
            />
          </div>
          {err ? <p className="text-sm text-red-300">{err}</p> : null}
          {meet.recordConsent ? (
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
              Согласен на запись этого совещания
            </label>
          ) : null}
          {meet.canHost ? (
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input type="checkbox" checked={wantRec} onChange={(e) => setWantRec(e.target.checked)} className="mt-1" />
              Писать звук и после звонка сразу собрать сводку (то, что слышите вы)
            </label>
          ) : null}
          <p className="text-sm text-white/70">
            {iceReady ? "Проверьте камеру и микрофон, затем войдите." : "Подключаем серверы связи…"}
          </p>
          <div className="flex gap-2">
            <button type="button" className="rounded-full bg-white/10 p-3" onClick={toggleMic} title="Микрофон">
              {mic ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button type="button" className="rounded-full bg-white/10 p-3" onClick={toggleCam} title="Камера">
              {cam ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button
              type="button"
              className="rounded-full bg-gold px-6 py-3 font-semibold text-navy disabled:opacity-50"
              disabled={!iceReady}
              onClick={() => void join()}
            >
              Войти
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3 md:flex-row">
          <div ref={stage} className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
            {presenter ? (
              <div className="min-h-0 flex-1">
                {presenter === meId ? (
                  <Tile stream={localStream} name="Вы" self videoOn muted sharing large />
                ) : (
                  <Tile
                    stream={remote[presenter] || null}
                    name={peers.find((p) => p.id === presenter)?.fullName || "Экран"}
                    videoOn
                    sharing
                    large
                  />
                )}
              </div>
            ) : null}
            <div
              className={`grid gap-2 ${
                presenter
                  ? "h-28 shrink-0 grid-cols-4 md:grid-cols-6"
                  : peers.length + 1 <= 2
                    ? "min-h-0 flex-1 grid-cols-1 md:grid-cols-2"
                    : peers.length <= 4
                      ? "min-h-0 flex-1 grid-cols-2"
                      : "min-h-0 flex-1 grid-cols-2 lg:grid-cols-3"
              }`}
            >
              {presenter !== meId ? <Tile stream={localStream} name="Вы" self videoOn={cam || screen} muted sharing={screen} /> : null}
              {(presenter ? rest : peers).map((p) => (
                <Tile key={p.id} stream={remote[p.id] || null} name={p.fullName} videoOn={p.videoOn || p.screenOn} sharing={p.screenOn} />
              ))}
            </div>
          </div>
          <aside className={`${chatOpen ? "flex" : "hidden md:flex"} w-full shrink-0 flex-col rounded-2xl bg-white/5 p-3 md:w-80`}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-white/50">Чат созвона</p>
              <button type="button" className="text-xs text-white/50 md:hidden" onClick={() => setChatOpen(false)}>
                скрыть
              </button>
            </div>
            <div className="min-h-0 flex-1 text-navy">
              <MeetChat meetingId={meet.id} live dark />
            </div>
            <p className="mt-3 text-xs uppercase tracking-wide text-white/50">В сети {peers.length + 1}</p>
            <ul className="mt-2 max-h-28 space-y-2 overflow-auto">
              <li className="text-sm">Вы</li>
              {peers.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <Avatar photoFileId={p.photoFileId} lastName={p.fullName} firstName="" size={24} />
                  <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                  {p.audioOn ? null : <MicOff size={12} />}
                </li>
              ))}
            </ul>
            {meet.files.length ? (
              <div className="mt-2 min-h-0 max-h-28 overflow-auto">
                <MeetFileGrid files={meet.files} dark />
              </div>
            ) : null}
          </aside>
        </div>
      )}

      {ready ? (
        <div className="flex flex-wrap items-center justify-center gap-3 pb-5">
          <button type="button" className={`rounded-full p-3 ${mic ? "bg-white/15" : "bg-bad"}`} onClick={toggleMic} title="Микрофон">
            {mic ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button type="button" className={`rounded-full p-3 ${cam ? "bg-white/15" : "bg-bad"}`} onClick={toggleCam} title="Камера">
            {cam ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button type="button" className={`rounded-full p-3 ${screen ? "bg-gold text-navy" : "bg-white/15"}`} onClick={() => void toggleScreen()} title="Показать экран">
            <MonitorUp size={20} />
          </button>
          <button type="button" className="rounded-full bg-white/15 p-3" onClick={() => setLarge((v) => !v)} title={large ? "Сетка" : "Крупно"}>
            <Rows3 size={20} />
          </button>
          <button type="button" className="rounded-full bg-white/15 p-3" onClick={() => void full()} title="На весь экран">
            {isFull ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
          <button type="button" className="rounded-full bg-white/15 p-3 md:hidden" onClick={() => setChatOpen((v) => !v)} title="Чат">
            <MessageCircle size={20} />
          </button>
          <button type="button" className="rounded-full bg-bad p-3" onClick={() => void hangup(meet.canHost)} title={meet.canHost ? "Завершить созвон" : "Выйти"}>
            <PhoneOff size={20} />
          </button>
        </div>
      ) : null}
      {lanFail ? (
        <p className="px-4 pb-3 text-center text-xs text-gold">
          Связь оборвалась, пробуем собрать снова. Если тишина больше нескольких секунд — выйдите и войдите ещё раз.
        </p>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import type { MeetDto } from "./MeetView";
import { MeetFileGrid } from "./MeetFiles";

type PeerInfo = { id: string; fullName: string; photoFileId: string; audioOn: boolean; videoOn: boolean; screenOn: boolean };

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function Tile({
  stream,
  name,
  self,
  videoOn,
  muted,
}: {
  stream: MediaStream | null;
  name: string;
  self?: boolean;
  videoOn?: boolean;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  const showVideo = Boolean(stream && videoOn !== false);
  return (
    <div className="relative min-h-[140px] overflow-hidden rounded-2xl bg-navy/80">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted || self}
        className={`h-full w-full object-cover ${showVideo ? "" : "opacity-0"}`}
      />
      {!showVideo ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-white/10 px-3 py-2 text-sm text-white">{name}</span>
        </div>
      ) : null}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">
        {name}
        {self ? " · вы" : ""}
      </span>
    </div>
  );
}

export function MeetRoom({ meet, meId }: { meet: MeetDto; meId: string }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [mic, setMic] = useState(true);
  const [cam, setCam] = useState(true);
  const [screen, setScreen] = useState(false);
  const [lanFail, setLanFail] = useState(false);
  const [err, setErr] = useState("");
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [remote, setRemote] = useState<Record<string, MediaStream>>({});
  const localRef = useRef<MediaStream | null>(null);
  const camTrack = useRef<MediaStreamTrack | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const making = useRef(new Map<string, boolean>());
  const after = useRef("");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

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

  const ensurePc = useCallback(
    async (peerId: string) => {
      const hit = pcs.current.get(peerId);
      if (hit) return hit;
      const pc = new RTCPeerConnection(ICE);
      localRef.current?.getTracks().forEach((t) => pc.addTrack(t, localRef.current!));
      pc.onicecandidate = (e) => {
        if (e.candidate) postSignal("ice", peerId, e.candidate);
      };
      pc.ontrack = (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        setRemote((prev) => ({ ...prev, [peerId]: stream }));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setLanFail(true);
      };
      pcs.current.set(peerId, pc);
      return pc;
    },
    [postSignal],
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

  const hangup = useCallback(async () => {
    heartbeat({ leave: true });
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
    router.push(`/meet/${meet.id}`);
  }, [heartbeat, meet.id, router]);

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
    if (meet.canHost && meet.status === "scheduled") {
      await fetch(`/api/meet/${meet.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "live" }),
      });
    }
    setReady(true);
  }

  useEffect(() => {
    void startPreview();
    return () => {
      localRef.current?.getTracks().forEach((t) => t.stop());
      pcs.current.forEach((pc) => pc.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    async function tick() {
      if (stop) return;
      heartbeat();
      const pr = await fetch(`/api/meet/${meet.id}/peers`);
      const pd = await pr.json().catch(() => ({}));
      const list: PeerInfo[] = (pd.peers || []).filter((p: PeerInfo) => p.id !== meId);
      setPeers(list);
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
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          postSignal("answer", s.from, pc.localDescription);
        } else if (s.kind === "answer") {
          const pc = pcs.current.get(s.from);
          if (pc && pc.signalingState !== "stable") {
            await pc.setRemoteDescription(payload as RTCSessionDescriptionInit).catch(() => {});
          }
        } else if (s.kind === "ice") {
          const pc = await ensurePc(s.from);
          await pc.addIceCandidate(payload as RTCIceCandidateInit).catch(() => {});
        }
      }
    }
    void tick();
    const t = setInterval(() => void tick(), 500);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [ready, meet.id, meId, heartbeat, offerTo, ensurePc, postSignal, hangup]);

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
      heartbeat({ screenOn: true });
    } catch {
      /* user cancel */
    }
  }

  const cols = peers.length + 1 <= 2 ? "grid-cols-1 md:grid-cols-2" : peers.length <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#0e1c2c] text-white">
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <p className="font-serif text-xl">{meet.title}</p>
          <p className="text-xs text-white/60">{meet.place}</p>
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
          <p className="text-sm text-white/70">Проверьте камеру и микрофон, затем войдите.</p>
          <div className="flex gap-2">
            <button type="button" className="rounded-full bg-white/10 p-3" onClick={toggleMic} title="Микрофон">
              {mic ? <Mic size={18} /> : <MicOff size={18} />}
            </button>
            <button type="button" className="rounded-full bg-white/10 p-3" onClick={toggleCam} title="Камера">
              {cam ? <Video size={18} /> : <VideoOff size={18} />}
            </button>
            <button type="button" className="rounded-full bg-gold px-6 py-3 font-semibold text-white" onClick={() => void join()}>
              Войти
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
          <div className={`grid min-h-0 flex-1 gap-2 ${cols}`}>
            <Tile stream={localStream} name="Вы" self videoOn={cam || screen} muted />
            {peers.map((p) => (
              <Tile key={p.id} stream={remote[p.id] || null} name={p.fullName} videoOn={p.videoOn || p.screenOn} />
            ))}
          </div>
          <aside className="hidden w-64 shrink-0 flex-col rounded-2xl bg-white/5 p-3 md:flex">
            <p className="text-xs uppercase tracking-wide text-white/50">В сети {peers.length + 1}</p>
            <ul className="mt-2 space-y-2 overflow-auto">
              <li className="flex items-center gap-2 text-sm">Вы</li>
              {peers.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <Avatar photoFileId={p.photoFileId} lastName={p.fullName} firstName="" size={24} />
                  <span className="min-w-0 flex-1 truncate">{p.fullName}</span>
                  {p.audioOn ? null : <MicOff size={12} />}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs uppercase tracking-wide text-white/50">Материалы</p>
            <div className="mt-2 min-h-0 flex-1 overflow-auto">
              <MeetFileGrid files={meet.files} dark />
            </div>
          </aside>
        </div>
      )}

      {ready ? (
        <div className="flex items-center justify-center gap-3 pb-5">
          <button type="button" className={`rounded-full p-3 ${mic ? "bg-white/15" : "bg-bad"}`} onClick={toggleMic} title="Микрофон">
            {mic ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
          <button type="button" className={`rounded-full p-3 ${cam ? "bg-white/15" : "bg-bad"}`} onClick={toggleCam} title="Камера">
            {cam ? <Video size={20} /> : <VideoOff size={20} />}
          </button>
          <button type="button" className={`rounded-full p-3 ${screen ? "bg-gold" : "bg-white/15"}`} onClick={() => void toggleScreen()} title="Экран">
            <MonitorUp size={20} />
          </button>
          <button type="button" className="rounded-full bg-bad p-3" onClick={() => void hangup()} title="Выйти">
            <PhoneOff size={20} />
          </button>
        </div>
      ) : null}
      {lanFail ? (
        <p className="px-4 pb-3 text-center text-xs text-gold">
          Связь не собралась. Созвон рассчитан на офисную сеть (192.168.1.51), не на туннель.
        </p>
      ) : null}
    </div>
  );
}

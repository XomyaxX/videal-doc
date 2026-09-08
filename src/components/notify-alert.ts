import { parseUrgency, type Urgency } from "@/lib/notify-urgency";
import { isPhoneClient, vibratePattern } from "@/lib/notify-haptics";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

function beep(ac: AudioContext, freq: number, start: number, dur: number, gain: number) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playUrgencyTone(level: Urgency) {
  const ac = audio();
  if (!ac) return;
  void ac.resume();
  const t = ac.currentTime + 0.02;
  if (level === "info") {
    beep(ac, 880, t, 0.09, 0.06);
    return;
  }
  if (level === "normal") {
    beep(ac, 523, t, 0.12, 0.1);
    beep(ac, 659, t + 0.14, 0.14, 0.1);
    return;
  }
  beep(ac, 880, t, 0.16, 0.16);
  beep(ac, 660, t + 0.18, 0.16, 0.16);
  beep(ac, 880, t + 0.4, 0.2, 0.16);
}

export function buzz(level: Urgency) {
  const pattern = vibratePattern(level);
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

export async function fireLocalAlert(opts: {
  title: string;
  body?: string;
  link?: string;
  urgency?: string;
  id?: string;
  test?: boolean;
}) {
  const urgency = parseUrgency(opts.urgency);
  buzz(urgency);
  const phone = isPhoneClient();
  if (!phone) playUrgencyTone(urgency);
  if (!opts.test && !phone) return { ok: true as const, reason: "" };

  if (typeof Notification === "undefined") {
    if (phone) playUrgencyTone(urgency);
    return { ok: false, reason: "Этот браузер не умеет уведомления" };
  }
  if (Notification.permission !== "granted") {
    if (phone) playUrgencyTone(urgency);
    return { ok: false, reason: "Разрешите уведомления — иначе телефон играет это как медиа" };
  }
  if (!("serviceWorker" in navigator)) {
    if (phone) playUrgencyTone(urgency);
    return { ok: false, reason: "Нет service worker" };
  }
  const reg = await navigator.serviceWorker.ready;
  const tag = "vd-" + (opts.id || `t${Date.now()}`);
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body: opts.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: vibratePattern(urgency),
    requireInteraction: urgency === "urgent",
    renotify: true,
    tag,
    data: { link: opts.link || "/", urgency },
  };
  await reg.showNotification(opts.title || "Видеал.Док", options);
  return { ok: true as const, reason: "" };
}

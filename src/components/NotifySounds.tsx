"use client";

import { useEffect, useRef } from "react";
import { parseUrgency, type Urgency } from "@/lib/notify-urgency";
import { fireLocalAlert } from "@/components/notify-alert";

const CURSOR_KEY = "vd-notify-cursor";

function loudest(items: { urgency?: string }[]): Urgency | null {
  if (!items.length) return null;
  if (items.some((i) => parseUrgency(i.urgency) === "urgent")) return "urgent";
  if (items.some((i) => parseUrgency(i.urgency) === "normal")) return "normal";
  return "info";
}

export function NotifySounds({ enabled }: { enabled: boolean }) {
  const enabledRef = useRef(enabled);

  useEffect(() => {
    function read() {
      try {
        const v = localStorage.getItem("vd-sound-alerts");
        if (v === "0") return false;
        if (v === "1") return true;
      } catch {
        /* ignore */
      }
      return enabled;
    }
    enabledRef.current = read();
    const on = () => {
      enabledRef.current = read();
    };
    window.addEventListener("vd-sound-alerts", on);
    return () => window.removeEventListener("vd-sound-alerts", on);
  }, [enabled]);

  useEffect(() => {
    let stop = false;

    async function tick(play: boolean) {
      if (stop) return;
      const after = sessionStorage.getItem(CURSOR_KEY) || "";
      const q = after ? `?after=${encodeURIComponent(after)}` : "";
      const res = await fetch(`/api/notifications/since${q}`).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (!data || stop) return;
      if (typeof data.cursor === "string") sessionStorage.setItem(CURSOR_KEY, data.cursor);
      const items = Array.isArray(data.items) ? data.items : [];
      if (!play || !items.length || document.visibilityState === "hidden") return;
      if (!enabledRef.current) return;
      const level = loudest(items);
      if (!level) return;
      const top = items.find((i: { urgency?: string }) => parseUrgency(i.urgency) === level) || items[items.length - 1];
      await fireLocalAlert({
        title: top.title || "Видеал.Док",
        body: items.length > 1 ? `Ещё ${items.length - 1}` : "",
        link: "/",
        urgency: level,
        id: top.id,
      });
    }

    void tick(false);
    const t = setInterval(() => void tick(true), 10_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return null;
}

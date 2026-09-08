"use client";

import { useEffect } from "react";
import { collectOfficeHints } from "@/lib/lan-client";

export function PresencePing() {
  useEffect(() => {
    let stop = false;
    async function ping() {
      if (document.visibilityState === "hidden") return;
      const localIps = await collectOfficeHints();
      const res = await fetch("/api/presence/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localIps }),
      }).catch(() => null);
      const data = res ? await res.json().catch(() => null) : null;
      if (data?.autoIn) window.dispatchEvent(new Event("vd-presence"));
    }
    void ping();
    const t = setInterval(() => {
      if (!stop) void ping();
    }, 150_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  return null;
}

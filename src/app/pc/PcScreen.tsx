"use client";

import { useEffect, useState } from "react";

function deviceId() {
  const key = "vd_pc_device";
  let id = "";
  try {
    id = localStorage.getItem(key) || "";
  } catch {
    /* private mode */
  }
  if (id.length >= 8) return id;
  id = crypto.randomUUID();
  try {
    localStorage.setItem(key, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function PcScreen() {
  const [code, setCode] = useState("");
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    const device = deviceId();
    let stop = false;
    async function tick() {
      const res = await fetch("/api/pc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device }),
      });
      const data = await res.json().catch(() => ({}));
      if (stop) return;
      if (!res.ok) {
        setOn(false);
        setCode("");
        setErr(data.error || "Нет доступа");
        return;
      }
      setErr("");
      setOn(Boolean(data.identify));
      setCode(String(data.code || ""));
    }
    void tick();
    const t = setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <h1 className="font-serif text-3xl text-navy">Экран компьютера</h1>
      {err ? <p className="mt-3 max-w-md text-center text-muted">{err}</p> : null}
      {on && code ? (
        <>
          <p className="mt-8 font-serif text-7xl font-semibold tracking-widest text-navy">{code}</p>
          <p className="mt-4 max-w-md text-center text-muted">Назовите этот номер администратору, пока идёт обход.</p>
        </>
      ) : (
        <p className="mt-3 max-w-md text-center text-muted">
          {on ? "Ждём номер…" : "Обход с номерами выключен. Можно закрыть вкладку."}
        </p>
      )}
    </div>
  );
}

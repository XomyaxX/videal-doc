"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

function clock(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Omsk" });
}

export function ArriveForm({
  token,
  valid,
  name,
  inAt,
  outAt,
  forgot,
  closed,
}: {
  token: string;
  valid: boolean;
  name: string;
  inAt: string | null;
  outAt: string | null;
  forgot: boolean;
  closed: string;
}) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [came, setCame] = useState(inAt);
  const [left, setLeft] = useState(outAt);
  const [leftForgot, setLeftForgot] = useState(forgot);
  const [note, setNote] = useState("");

  async function act(kind: "in" | "out") {
    setBusy(kind);
    setError("");
    setNote("");
    const res = await fetch("/api/gate/mark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, kind }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(data.error || "Не удалось отметить");
      return;
    }
    setCame(data.inAt || null);
    setLeft(data.outAt || null);
    setLeftForgot(data.outSource === "forgot");
    setNote(data.already ? "Эта отметка уже стоит." : kind === "in" ? "Приход отмечен." : "Уход отмечен.");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <p className="text-sm text-muted">Отметка у входа</p>
        <h1 className="mt-1 font-serif text-3xl text-navy">{name}</h1>
        {closed ? (
          <p className="mt-4 text-[15px]">{closed}</p>
        ) : valid ? (
          <>
            <p className="mt-4 text-sm text-muted">
              {came ? `Приход ${clock(came)}` : "Приход ещё не отмечен"}
              {left ? `. Уход ${clock(left)}${leftForgot ? ", забыл отметиться" : ""}` : ""}
            </p>
            <div className="mt-5 grid gap-3">
              <Button type="button" disabled={Boolean(busy)} onClick={() => void act("in")}>
                {busy === "in" ? "Отмечаем…" : "Отметить приход"}
              </Button>
              <Button type="button" variant="secondary" disabled={Boolean(busy)} onClick={() => void act("out")}>
                {busy === "out" ? "Отмечаем…" : "Отметить уход"}
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-4 text-[15px]">Код на телевизоре уже сменился. Отсканируйте QR ещё раз.</p>
        )}
        {note ? <p className="mt-4 text-sm text-muted">{note}</p> : null}
        {error ? <p className="mt-4 text-sm text-bad">{error}</p> : null}
      </Card>
    </main>
  );
}

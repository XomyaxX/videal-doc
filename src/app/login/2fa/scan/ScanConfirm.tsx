"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorText } from "@/components/ui";

export function ScanConfirm({
  challengeId,
  needCode,
}: {
  challengeId: string;
  needCode: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [info, setInfo] = useState<{ from?: string; ip?: string; status?: string }>({});

  useEffect(() => {
    if (!challengeId || needCode) return;
    void fetch(`/api/auth/2fa/challenge/${challengeId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setInfo(d);
      });
  }, [challengeId, needCode]);

  async function act(deny = false) {
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/2fa/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: challengeId, deny }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось");
      return;
    }
    setDone(deny ? "Вход на компьютере отклонили" : "Компьютер вошёл");
  }

  if (!challengeId) {
    return (
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl text-navy">Нет кода</h1>
        <p className="mt-2 text-sm text-muted">Откройте этот экран, сканируя квадрат на компьютере.</p>
      </Card>
    );
  }

  if (needCode) {
    const next = `/login/2fa/scan?c=${encodeURIComponent(challengeId)}`;
    return (
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl text-navy">Сначала этот телефон</h1>
        <p className="mt-2 text-sm text-muted">
          Введите 6 цифр из Яндекс Ключа, чтобы подтвердить телефон. Потом вернётесь сюда и подтвердите вход на компьютере.
        </p>
        <Button className="mt-4 w-full" href={`/login/2fa?next=${encodeURIComponent(next)}`}>
          Ввести код
        </Button>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl text-navy">{done}</h1>
        <Button className="mt-4 w-full" href="/">
          В Док
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <h1 className="font-serif text-2xl text-navy">Вход на компьютере</h1>
      <p className="mt-2 text-sm text-muted">
        {info.from ? `Устройство: ${info.from}` : "Подтвердите, что это вы."}
        {info.ip ? ` · ${info.ip}` : ""}
      </p>
      {info.status === "ok" ? <p className="mt-3 text-ok">Уже подтверждено</p> : null}
      {info.status === "expired" ? <p className="mt-3 text-bad">Квадрат истёк, на компьютере нажмите «Новый квадрат»</p> : null}
      {info.status === "denied" ? <p className="mt-3 text-bad">Этот вход уже отклонили</p> : null}
      <ErrorText>{error}</ErrorText>
      {info.status === "pending" || !info.status ? (
        <div className="mt-5 flex flex-col gap-2">
          <Button className="w-full" disabled={busy} onClick={() => void act(false)}>
            {busy ? "…" : "Это я, войти"}
          </Button>
          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void act(true)}>
            Это не я
          </Button>
        </div>
      ) : (
        <Button className="mt-4 w-full" href="/">
          В Док
        </Button>
      )}
    </Card>
  );
}

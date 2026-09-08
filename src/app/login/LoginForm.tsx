"use client";

import { useEffect, useState } from "react";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import {
  checkDevicePin,
  fetchDeviceAccounts,
  getDevicePin,
  setDevicePin,
  type SavedAccount,
} from "@/lib/accounts-client";

function nextAfterLogin(
  data: { mustChangePassword?: boolean; need2faSetup?: boolean; need2fa?: boolean },
  next = "",
) {
  if (data.mustChangePassword) return "/change-password";
  if (data.need2faSetup) return next ? `/setup-2fa?next=${encodeURIComponent(next)}` : "/setup-2fa";
  if (data.need2fa) return next ? `/login/2fa?next=${encodeURIComponent(next)}` : "/login/2fa";
  return next || "/";
}

export function LoginForm({
  add,
  orgShort = "ООО «Видеаль Медиа»",
  next = "",
}: {
  add: boolean;
  orgShort?: string;
  next?: string;
}) {
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);
  const [locked, setLocked] = useState(false);
  const [pin, setPin] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(add);

  useEffect(() => {
    try {
      localStorage.removeItem("vd_accounts");
    } catch {
      /* ignore */
    }
    setLocked(Boolean(getDevicePin()));
    void fetchDeviceAccounts().then((list) => {
      setAccounts(list);
      if (add || list.length === 0) setShowForm(true);
    });
  }, [add]);

  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    if (await checkDevicePin(pin)) {
      setLocked(false);
      setPin("");
    } else setError("Неверный PIN");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Не удалось войти");
      return;
    }
    window.location.href = nextAfterLogin(data, next);
  }

  async function switchTo(userId: string) {
    const res = await fetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) window.location.href = nextAfterLogin(data, next);
    else setError("Эта учётка больше не действует");
  }

  if (locked) {
    return (
      <Card className="w-full max-w-md">
        <h1 className="font-serif text-2xl text-navy">Введите PIN компьютера</h1>
        <p className="mt-1 text-sm text-muted">Список учёток на этом ПК закрыт PIN-кодом.</p>
        <form onSubmit={unlock} className="mt-5 space-y-3">
          <ErrorText>{error}</ErrorText>
          <Field label="PIN">
            <Input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
          </Field>
          <Button type="submit" className="w-full">
            Открыть
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <div className="stamp text-xs text-gold">{orgShort}</div>
      <h1 className="font-serif text-3xl text-navy">Видеал.Док</h1>
      <p className="mt-1 text-muted">Войдите в свою учётку или переключитесь на сохранённую.</p>

      {accounts.length > 0 && !showForm ? (
        <div className="mt-5 space-y-2">
          {accounts.map((a) => (
            <button
              key={a.userId}
              onClick={() => switchTo(a.userId)}
              className="w-full rounded-xl border border-line bg-white px-4 py-3 text-left hover:border-gold"
            >
              <span className="block font-semibold text-navy">{a.fullName}</span>
              <span className="text-sm text-muted">
                {a.roleName} · {a.login}
              </span>
            </button>
          ))}
          <Button variant="secondary" className="w-full" onClick={() => setShowForm(true)}>
            Другая учётка
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-3">
          <ErrorText>{error}</ErrorText>
          <Field label="Логин">
            <Input value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" required />
          </Field>
          <Field label="Пароль">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Входим…" : "Войти"}
          </Button>
          {accounts.length > 0 ? (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setShowForm(false)}>
              К сохранённым учёткам
            </Button>
          ) : null}
        </form>
      )}
    </Card>
  );
}

export function PinSetup() {
  const [pin, setPin] = useState("");
  const [done, setDone] = useState(false);
  if (done) return <p className="text-sm text-ok">PIN сохранён на этом компьютере.</p>;
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pin.length < 4) return;
        await setDevicePin(pin);
        setDone(true);
      }}
    >
      <Input placeholder="PIN на этот ПК" value={pin} onChange={(e) => setPin(e.target.value)} />
      <Button type="submit" variant="secondary">
        Поставить PIN
      </Button>
    </form>
  );
}

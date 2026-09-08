"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { fetchDeviceAccounts, type SavedAccount } from "@/lib/accounts-client";
import { Avatar } from "./Avatar";

export function AccountSwitcher({
  currentName,
  currentLogin,
  roleName,
  photoFileId,
  lastName,
  firstName,
}: {
  currentName: string;
  currentLogin: string;
  roleName: string;
  photoFileId?: string;
  lastName?: string;
  firstName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<SavedAccount[]>([]);

  useEffect(() => {
    void fetchDeviceAccounts().then(setAccounts);
  }, []);

  async function switchTo(userId: string) {
    const res = await fetch("/api/auth/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      if (data.mustChangePassword) window.location.href = "/change-password";
      else if (data.need2faSetup) window.location.href = "/setup-2fa";
      else if (data.need2fa) window.location.href = "/login/2fa";
      else window.location.href = "/";
    } else {
      setAccounts(await fetchDeviceAccounts());
      alert("Эта учётка больше не действует. Войдите заново.");
    }
  }

  async function forget(userId: string) {
    await fetch("/api/auth/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "forget", userId }),
    });
    setAccounts(await fetchDeviceAccounts());
  }

  const parts = currentName.split(" ");
  const ln = lastName || parts[0] || "?";
  const fn = firstName || parts[1] || "?";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/10"
      >
        <Avatar photoFileId={photoFileId} lastName={ln} firstName={fn} size={40} gold />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{currentName}</span>
          <span className="block truncate text-xs text-white/70">
            {roleName} · {currentLogin}
          </span>
        </span>
        <ChevronDown size={16} className="text-white/70" />
      </button>
      {open ? (
        <div className="absolute bottom-14 left-2 right-2 z-50 overflow-hidden rounded-xl border border-line bg-card text-ink shadow-[var(--shadow)]">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">Учётки на этом компьютере</p>
          {accounts.map((a) => (
            <div key={a.userId} className="flex items-center gap-1 border-t border-line">
              <button
                className="flex-1 px-3 py-2 text-left text-sm hover:bg-paper"
                onClick={() => switchTo(a.userId)}
              >
                <span className="block font-semibold">{a.fullName}</span>
                <span className="block text-xs text-muted">
                  {a.roleName} · {a.login}
                </span>
              </button>
              <button className="px-2 text-muted hover:text-bad" onClick={() => forget(a.userId)} title="Забыть">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <a href="/profile" className="block border-t border-line px-3 py-2 text-sm hover:bg-paper">
            Профиль и выход
          </a>
          <a href="/login?add=1" className="flex items-center gap-2 border-t border-line px-3 py-2 text-sm font-semibold text-navy hover:bg-paper">
            <Plus size={16} /> Добавить учётку
          </a>
        </div>
      ) : null}
    </div>
  );
}

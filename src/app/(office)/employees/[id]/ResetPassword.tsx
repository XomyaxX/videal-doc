"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function ResetPassword({ id }: { id: string }) {
  const [pwd, setPwd] = useState("");
  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <p className="font-semibold text-navy">Сброс пароля</p>
      <Button
        variant="secondary"
        className="mt-2"
        onClick={async () => {
          const res = await fetch(`/api/users/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reset-password" }),
          });
          const data = await res.json();
          if (data.tempPassword) setPwd(data.tempPassword);
        }}
      >
        Выдать новый временный пароль
      </Button>
      {pwd ? <p className="mt-3 font-mono text-lg">Новый пароль: {pwd}</p> : null}
      <Button
        variant="ghost"
        className="mt-3"
        onClick={async () => {
          const res = await fetch(`/api/users/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reset-2fa" }),
          });
          if (res.ok) alert("Код приложения сброшен. При следующем входе человек привяжет телефон заново.");
        }}
      >
        Сбросить код приложения (2FA)
      </Button>
    </div>
  );
}

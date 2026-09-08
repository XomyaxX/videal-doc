"use client";

import { Button, Card } from "@/components/ui";
import { clearDevicePin } from "@/lib/accounts-client";

export function ProfileMenu() {
  return (
    <Card className="max-w-lg space-y-3">
      <Button href="/archive" variant="secondary">
        Личный архив
      </Button>
      <Button href="/change-password" variant="secondary">
        Сменить пароль
      </Button>
      <Button href="/login?add=1" variant="secondary">
        Добавить другую учётку
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          clearDevicePin();
          alert("PIN этого компьютера снят");
        }}
      >
        Снять PIN с этого ПК
      </Button>
      <Button
        variant="danger"
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        }}
      >
        Выйти из этой учётки
      </Button>
    </Card>
  );
}

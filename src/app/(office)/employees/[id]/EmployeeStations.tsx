"use client";

import { Button, Card } from "@/components/ui";

type Row = { id: string; mac: string; ipv4: string; label: string; online: boolean; lastSeenAt: string | null };

export function EmployeeStations({ rows, canEdit }: { rows: Row[]; canEdit: boolean }) {
  if (rows.length === 0 && !canEdit) return null;

  async function drop(id: string) {
    if (!confirm("Отвязать этот ПК?")) return;
    await fetch("/api/admin/office-lan", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    window.location.reload();
  }

  return (
    <Card className="mt-6 max-w-lg space-y-2">
      <h2 className="font-serif text-xl text-navy">Рабочий ПК</h2>
      <p className="text-sm text-muted">Сервер отмечает приход, когда этот компьютер появляется в офисной сети.</p>
      {rows.length === 0 ? <p className="text-sm text-muted">Ещё не привязан. Админ сканирует сеть в Настройках.</p> : null}
      <ul className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="font-semibold">{r.label || "ПК"}</span>
              <span className="ml-2 text-muted">
                {r.mac}
                {r.ipv4 ? ` · ${r.ipv4}` : ""}
                {r.online ? " · в сети" : " · не видно"}
              </span>
            </span>
            {canEdit ? (
              <Button variant="ghost" onClick={() => void drop(r.id)}>
                Отвязать
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

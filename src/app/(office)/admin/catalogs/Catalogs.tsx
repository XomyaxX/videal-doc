"use client";

import { useState } from "react";
import { Button, Card, Input } from "@/components/ui";

export function Catalogs({
  departments,
  positions,
}: {
  departments: { id: string; name: string }[];
  positions: { id: string; name: string }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <List kind="department" title="Отделы" items={departments} />
      <List kind="position" title="Должности" items={positions} />
    </div>
  );
}

function List({ kind, title, items }: { kind: string; title: string; items: { id: string; name: string }[] }) {
  const [name, setName] = useState("");
  return (
    <Card>
      <h2 className="font-serif text-xl text-navy">{title}</h2>
      <ul className="mt-3 divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between py-2">
            {i.name}
            <button
              className="text-sm text-bad"
              onClick={async () => {
                await fetch("/api/admin/catalogs", {
                  method: "DELETE",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ kind, id: i.id }),
                });
                window.location.reload();
              }}
            >
              скрыть
            </button>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await fetch("/api/admin/catalogs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, name }),
          });
          window.location.reload();
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" />
        <Button type="submit">Добавить</Button>
      </form>
    </Card>
  );
}

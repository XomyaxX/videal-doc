"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Select } from "@/components/ui";

export function TmcNewForm({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/inventory/tmc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: String(fd.get("userId") || "") }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не создалось");
      setBusy(false);
      return;
    }
    router.push(`/inventory/tmc/${data.id}`);
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card>
        <Field label="Сотрудник (материально ответственное лицо)">
          <Select name="userId" required>
            <option value="">— выберите —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>
      <ErrorText>{err}</ErrorText>
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Создаём…" : "Составить"}
        </Button>
        <Button type="button" variant="secondary" href="/inventory">
          Отмена
        </Button>
      </div>
    </form>
  );
}

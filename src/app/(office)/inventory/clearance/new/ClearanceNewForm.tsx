"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, ErrorText, Field, Select, Textarea } from "@/components/ui";
import { CLEARANCE_REASON } from "@/lib/clearance";

export function ClearanceNewForm({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/inventory/clearance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: String(fd.get("userId") || ""),
        reason: String(fd.get("reason") || "dismissal"),
        note: String(fd.get("note") || ""),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не создалось");
      setBusy(false);
      return;
    }
    router.push(`/inventory/clearance/${data.id}`);
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card>
        <Field label="Сотрудник">
          <Select name="userId" required>
            <option value="">— выберите —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Основание">
          <Select name="reason" defaultValue="dismissal">
            {Object.entries(CLEARANCE_REASON).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Примечание">
          <Textarea name="note" placeholder="По желанию" />
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

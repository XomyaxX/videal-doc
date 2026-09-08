"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function DeleteLibrary({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm("Убрать файл из хранилища? С диска он не удалится.")) return;
    setBusy(true);
    const res = await fetch(`/api/library/${id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) router.push("/library");
  }

  return (
    <Button type="button" variant="danger" disabled={busy} onClick={remove}>
      Скрыть
    </Button>
  );
}

"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button, Card } from "@/components/ui";

async function squareJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const sx = (bmp.width - side) / 2;
  const sy = (bmp.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, sx, sy, side, side, 0, 0, 512, 512);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) throw new Error("Не удалось обработать фото");
  return blob;
}

export function PhotoCard({
  photoFileId,
  lastName,
  firstName,
}: {
  photoFileId: string;
  lastName: string;
  firstName: string;
}) {
  const [photo, setPhoto] = useState(photoFileId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const blob = await squareJpeg(file);
      const fd = new FormData();
      fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/profile/photo", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не загрузилось");
      setPhoto(data.id);
      setMsg("Фото стоит");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ошибка");
    }
    setBusy(false);
  }

  async function clear() {
    if (busy) return;
    setBusy(true);
    const res = await fetch("/api/profile/photo", { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      setPhoto("");
      setMsg("Фото снято");
    }
  }

  return (
    <Card className="max-w-lg space-y-3">
      <h2 className="font-serif text-xl text-navy">Фотография</h2>
      <div className="flex items-center gap-4">
        <Avatar photoFileId={photo} lastName={lastName} firstName={firstName} size={88} gold />
        <div className="space-y-2">
          <label className="inline-flex cursor-pointer">
            <span className="rounded-xl bg-navy px-4 py-2.5 text-[15px] font-semibold text-white">
              {busy ? "Грузим…" : photo ? "Сменить фото" : "Поставить фото"}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="user"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                void onFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {photo ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void clear()}>
              Убрать
            </Button>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-muted">Квадрат, видно сотрудникам в чате и в справочнике. Не шифруется — это визитка офиса.</p>
      {msg ? <p className="text-sm text-ok">{msg}</p> : null}
    </Card>
  );
}

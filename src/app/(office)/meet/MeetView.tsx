"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Pill } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { FileDrop } from "@/components/FileDrop";
import { fmtDateTime } from "@/lib/dates";
import { uploadMeetFile } from "@/lib/meet-upload";
import { MeetFileGrid } from "./MeetFiles";

type Part = { id: string; fullName: string; photoFileId: string; rsvp: string; host: boolean };
type FileRow = { id: string; name: string; mime: string; size: number };
export type MeetDto = {
  id: string;
  title: string;
  body: string;
  place: string;
  startsAt: string;
  endsAt: string;
  status: string;
  authorId: string;
  authorName: string;
  canHost: boolean;
  canJoin: boolean;
  myRsvp: string;
  participants: Part[];
  files: FileRow[];
};

const STATUS: Record<string, string> = {
  scheduled: "Запланировано",
  live: "Идёт созвон",
  done: "Завершено",
  cancelled: "Отменено",
};

function rsvpLabel(s: string) {
  if (s === "yes") return "Буду";
  if (s === "no") return "Не смогу";
  return "Не ответил";
}

export function MeetView({ initial }: { initial: MeetDto }) {
  const router = useRouter();
  const [meet, setMeet] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/meet/${initial.id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setMeet(data);
  }, [initial.id]);

  useEffect(() => {
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/meet/${meet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data.error || "Не вышло");
    else setMeet(data);
    setBusy(false);
  }

  const live = meet.status === "live";
  const open = meet.canJoin || live || meet.canHost;

  return (
    <div>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{fmtDateTime(meet.startsAt)} — {fmtDateTime(meet.endsAt)}</p>
            <h1 className="font-serif text-3xl text-navy">{meet.title}</h1>
            <p className="mt-1 text-navy">{meet.place || "Место не указано"}</p>
          </div>
          <Pill tone={live ? "wait" : meet.status === "cancelled" ? "draft" : "navy"}>{STATUS[meet.status] || meet.status}</Pill>
        </div>
        {meet.body ? <p className="mt-4 whitespace-pre-wrap text-sm">{meet.body}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {open && meet.status !== "cancelled" && meet.status !== "done" ? (
            <Button href={`/meet/${meet.id}/room`}>{live || meet.canHost ? "Войти в созвон" : "Открыть комнату"}</Button>
          ) : null}
          {meet.canHost && meet.status === "scheduled" ? (
            <Button variant="gold" disabled={busy} onClick={() => void patch({ status: "live" })}>
              Начать сейчас
            </Button>
          ) : null}
          {meet.canHost && (meet.status === "live" || meet.status === "scheduled") ? (
            <Button variant="secondary" disabled={busy} onClick={() => void patch({ status: "done" })}>
              Завершить
            </Button>
          ) : null}
          {meet.canHost && meet.status === "scheduled" ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (confirm("Отменить совещание?")) void patch({ status: "cancelled" });
              }}
            >
              Отменить
            </Button>
          ) : null}
        </div>
        {meet.status === "scheduled" || meet.status === "live" ? (
          <div className="mt-4 flex gap-2">
            <span className="self-center text-sm text-muted">Вы:</span>
            <Button variant={meet.myRsvp === "yes" ? "primary" : "secondary"} disabled={busy} onClick={() => void patch({ rsvp: "yes" })}>
              Буду
            </Button>
            <Button variant={meet.myRsvp === "no" ? "danger" : "secondary"} disabled={busy} onClick={() => void patch({ rsvp: "no" })}>
              Не смогу
            </Button>
          </div>
        ) : null}
        <ErrorText>{err}</ErrorText>
      </Card>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl text-navy">Кто нужен</h2>
          <ul className="mt-3 space-y-2">
            {meet.participants.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Avatar photoFileId={p.photoFileId} lastName={p.fullName} firstName="" size={32} />
                <span className="min-w-0 flex-1 text-sm">
                  {p.fullName}
                  {p.host ? <span className="text-xs text-muted"> · ведущий</span> : null}
                </span>
                <span className="text-xs text-muted">{rsvpLabel(p.rsvp)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="font-serif text-xl text-navy">Материалы</h2>
          <p className="mb-3 text-sm text-muted">Нажмите карточку, чтобы открыть. PDF листается в окне.</p>
          <MeetFileGrid files={meet.files} />
          {meet.canHost && meet.status !== "cancelled" ? (
            <div className="mt-3">
              <FileDrop
                compact
                files={[]}
                hint="Можно добавить ещё pdf или картинку"
                busy={busy}
                onAdd={(list) => {
                  void (async () => {
                    setBusy(true);
                    setErr("");
                    try {
                      for (const f of list) {
                        await uploadMeetFile(meet.id, f);
                      }
                      await load();
                    } catch (er) {
                      setErr(er instanceof Error ? er.message : "Ошибка");
                    }
                    setBusy(false);
                  })();
                }}
                onRemove={() => {}}
              />
            </div>
          ) : null}
        </Card>
      </div>
      <p className="mt-4">
        <Link href="/meet" className="text-sm text-muted underline">
          Все совещания
        </Link>
        <button type="button" className="ml-4 text-sm text-muted underline" onClick={() => router.refresh()}>
          обновить
        </button>
      </p>
    </div>
  );
}

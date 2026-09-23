"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Pill } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { FileDrop } from "@/components/FileDrop";
import { fmtDateTime } from "@/lib/dates";
import { uploadMeetFile } from "@/lib/meet-upload";
import { MeetFileGrid } from "./MeetFiles";
import { MeetChat } from "./MeetChat";
import { MeetProposedTasks } from "./MeetProposedTasks";

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
  myName?: string;
  recordConsent?: boolean;
  guestEnabled?: boolean;
  guestToken?: string;
  visibility?: string;
  destinations?: string[];
  viewerIds?: string[];
  recordingFileId?: string;
  recordingStereo?: boolean;
  speakerLeft?: string;
  speakerRight?: string;
  summaryStatus?: string;
  summaryProgress?: number;
  transcript?: string;
  summary?: {
    title: string;
    theses: string[];
    decisions: string[];
    actions: { task: string; brief?: string; owner: string; due: string }[];
    open_questions: string[];
    risks: string[];
    summaryMarkdown?: string;
  } | null;
  summaryMarkdown?: string;
  summaryError?: string;
  summaryDelivered?: Record<string, string>;
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
  const [copied, setCopied] = useState(false);
  const [leftName, setLeftName] = useState(initial.speakerLeft || "Организатор");
  const [rightName, setRightName] = useState(initial.speakerRight || "Участники");
  const [transcript, setTranscript] = useState(initial.transcript || "");
  const transcriptDirty = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/meet/${initial.id}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMeet(data);
      if (!transcriptDirty.current && typeof data.transcript === "string") setTranscript(data.transcript);
    }
  }, [initial.id]);

  const processing = Boolean(
    meet.summaryStatus && !["none", "ready", "failed"].includes(meet.summaryStatus),
  );

  useEffect(() => {
    const t = setInterval(() => void load(), processing ? 2000 : 8000);
    return () => clearInterval(t);
  }, [load, processing]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/meet/${meet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не вышло");
      setBusy(false);
      return false;
    }
    setMeet(data);
    setBusy(false);
    return true;
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
            {meet.place === "Онлайн" || meet.place === "Гибрид" ? (
              <p className="mt-1 text-sm text-muted">Созвон свой, в браузере. Из дома связь идёт через TURN; в офисной сети обычно стабильнее.</p>
            ) : null}
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
          {meet.canHost ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void patch({ guestEnabled: !meet.guestEnabled })}
            >
              {meet.guestEnabled ? "Гостевая ссылка включена" : "Пускать гостей по ссылке"}
            </Button>
          ) : null}
          {meet.canHost && meet.guestEnabled && meet.guestToken ? (
            <Button
              variant="ghost"
              onClick={() => {
                const url = `${window.location.origin}/meet/join/${meet.guestToken}`;
                void navigator.clipboard.writeText(url).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              {copied ? "Ссылка скопирована" : "Скопировать ссылку для гостей"}
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
        {open && meet.status !== "cancelled" && meet.status !== "done" ? (
          <p className="mt-2 text-xs text-muted">В комнате: камера, микрофон, показ экрана, чат. Из дома подождите «Подключаем серверы связи», затем войдите.</p>
        ) : null}
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

      {meet.canHost ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Запись и сводка</h2>
          <p className="mt-1 text-sm text-muted">
            Запись из комнаты Дока идёт по дорожкам с именами. Загруженный mp3 размечается «Спикер 1 / 2»; Gemini подставит фамилии и поправит смысл, если в тексте есть подсказки. Имена можно поправить в расшифровке.
          </p>
          {meet.recordingStereo ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                Левый канал
                <input
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                  value={leftName}
                  onChange={(e) => setLeftName(e.target.value)}
                />
              </label>
              <label className="text-sm">
                Правый канал
                <input
                  className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                  value={rightName}
                  onChange={(e) => setRightName(e.target.value)}
                />
              </label>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => void patch({ speakerLeft: leftName, speakerRight: rightName })}
              >
                Сохранить имена в расшифровке
              </Button>
            </div>
          ) : null}
          <input
            className="mt-3 block text-sm"
            type="file"
            accept="audio/*,video/mp4,video/webm,.mp3,.m4a,.wav,.webm,.mp4"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void (async () => {
                setBusy(true);
                setErr("");
                const fd = new FormData();
                fd.set("file", f);
                const res = await fetch(`/api/meet/${meet.id}/recording`, { method: "POST", body: fd });
                const data = await res.json().catch(() => ({}));
                setBusy(false);
                if (!res.ok) setErr(data.error || "Не загрузилось");
                else await load();
              })();
            }}
          />
          <p className="mt-2 text-sm text-muted">
            Статус:{" "}
            {meet.summaryStatus === "ready"
              ? "сводка готова"
              : meet.summaryStatus === "failed"
                ? `ошибка: ${meet.summaryError || "не вышло"}`
                : meet.summaryStatus === "none"
                  ? "записи ещё нет"
                  : `${meet.summaryError || "обрабатывается…"} · ${Math.max(0, Math.min(100, meet.summaryProgress || 0))}%`}
          </p>
          {processing ? (
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-gold transition-[width]"
                style={{ width: `${Math.max(4, Math.min(100, meet.summaryProgress || 0))}%` }}
              />
            </div>
          ) : null}
          {meet.recordingFileId && (meet.summaryStatus === "failed" || meet.summaryStatus === "ready") ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void fetch(`/api/meet/${meet.id}/summary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).then(() => load())
                }
              >
                Повторить сводку
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void fetch(`/api/meet/${meet.id}/summary`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ retranscribe: true }),
                  }).then(() => load())
                }
              >
                Расшифровать заново
              </Button>
              {meet.summaryStatus === "ready" ? (
                <Button variant="ghost" disabled={busy} onClick={() => void fetch(`/api/meet/${meet.id}/summary/deliver`, { method: "POST" }).then(() => load())}>
                  Повторить отправку
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {meet.summaryStatus === "ready" && meet.summary ? (
        <Card className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-navy">{meet.summary.title || "Сводка"}</h2>
            <span className="flex gap-2">
              <Button href={`/api/meet/${meet.id}/summary/download?kind=md`} variant="ghost">
                Скачать md
              </Button>
              <Button href={`/api/meet/${meet.id}/summary/download?kind=txt`} variant="ghost">
                Расшифровка
              </Button>
            </span>
          </div>
          {meet.summaryDelivered && Object.keys(meet.summaryDelivered).length ? (
            <p className="mt-1 text-sm text-muted">
              Сводка отправлена: {Object.keys(meet.summaryDelivered).map((k) => (k === "meeting_card" ? "карточка" : k === "notify_participants" ? "уведомления" : "файл")).join(" · ")}
            </p>
          ) : null}
          {meet.summary.summaryMarkdown ? (
            <p className="mt-3 whitespace-pre-wrap text-sm text-navy">{meet.summary.summaryMarkdown}</p>
          ) : null}
          <details className="mt-3" open>
            <summary className="cursor-pointer font-semibold text-navy">Тезисы</summary>
            {meet.summary.theses.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">{meet.summary.theses.map((t) => <li key={t}>{t}</li>)}</ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Модель не собрала тезисы — нажмите «Повторить».</p>
            )}
          </details>
          <details className="mt-3" open>
            <summary className="cursor-pointer font-semibold text-navy">Решения</summary>
            {meet.summary.decisions.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">{meet.summary.decisions.map((t) => <li key={t}>{t}</li>)}</ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Явных решений не зафиксировали.</p>
            )}
          </details>
          <details className="mt-3" open>
            <summary className="cursor-pointer font-semibold text-navy">Задачи</summary>
            {meet.summary.actions.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {meet.summary.actions.map((a) => (
                  <li key={a.task}>{a.task}{a.owner ? ` — ${a.owner}` : ""}{a.due ? ` · ${a.due}` : ""}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Явных поручений не назвали — это интервью/разговор, не план работ.</p>
            )}
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer font-semibold text-navy">Вопросы и риски</summary>
            {meet.summary.open_questions.length || meet.summary.risks.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {meet.summary.open_questions.map((t) => <li key={t}>{t}</li>)}
                {meet.summary.risks.map((t) => <li key={`r-${t}`}>риск: {t}</li>)}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">Отдельно не выделены.</p>
            )}
          </details>
          <details className="mt-3" open>
            <summary className="cursor-pointer font-semibold text-navy">Расшифровка</summary>
            {meet.canHost ? (
              <div className="mt-2">
                <p className="mb-1 text-xs text-muted">Можно подписать реплики: [мм:сс] Имя: текст</p>
                <textarea
                  className="min-h-[220px] w-full rounded-xl border border-line p-3 font-mono text-sm"
                  value={transcript}
                  onChange={(e) => {
                    transcriptDirty.current = true;
                    setTranscript(e.target.value);
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== meet.transcript) {
                      void patch({ transcript: e.target.value }).then((ok) => {
                        if (ok) transcriptDirty.current = false;
                      });
                    } else {
                      transcriptDirty.current = false;
                    }
                  }}
                />
              </div>
            ) : (
              <p className="mt-2 whitespace-pre-wrap text-sm text-navy">{meet.transcript}</p>
            )}
          </details>
          <MeetProposedTasks meetingId={meet.id} canLead={meet.canHost} />
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl text-navy">Доступ</h2>
          <p className="mt-2 text-sm text-navy">
            {meet.visibility === "custom"
              ? "Только выбранные люди"
              : meet.visibility === "participants_and_managers"
                ? "Участники и руководство"
                : "Только участники"}
          </p>
          <p className="mt-2 text-sm text-muted">
            Сводка уйдёт: {(meet.destinations || []).map((d) => (d === "notify_participants" ? "уведомления" : d === "attach_document" ? "файл" : "карточка")).join(", ")}
          </p>
        </Card>
        <Card>
          <h2 className="font-serif text-xl text-navy">Чат созвона</h2>
          <MeetChat meetingId={meet.id} live={meet.status === "live"} />
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

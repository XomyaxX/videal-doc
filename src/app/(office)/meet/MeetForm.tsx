"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Card, ErrorText, Field, Input, Textarea } from "@/components/ui";
import { FileDrop, type DroppedFile } from "@/components/FileDrop";
import { Avatar } from "@/components/Avatar";
import { MEET_DURATIONS, MEET_PLACES } from "@/lib/meet";
import { uploadMeetFile } from "@/lib/meet-upload";

type Person = {
  id: string;
  lastName: string;
  firstName: string;
  fullName: string;
  photoFileId: string;
  departmentName: string | null;
};
type Dept = { id: string; name: string };

function localInputValue(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function defaultStart() {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30);
  d.setSeconds(0, 0);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
  return d;
}

export function MeetForm({
  people,
  departments,
  meId,
}: {
  people: Person[];
  departments: Dept[];
  meId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [place, setPlace] = useState("Переговорка");
  const [start, setStart] = useState(localInputValue(defaultStart()));
  const [mins, setMins] = useState(60);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [createdId, setCreatedId] = useState("");
  const [visibility, setVisibility] = useState("participants");
  const [dest, setDest] = useState<Set<string>>(new Set(["meeting_card", "notify_participants"]));
  const [viewers, setViewers] = useState<Set<string>>(new Set());
  const [recordConsent, setRecordConsent] = useState(false);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return people.filter((p) => {
      if (p.id === meId) return false;
      if (!s) return true;
      return p.fullName.toLowerCase().includes(s) || (p.departmentName || "").toLowerCase().includes(s);
    });
  }, [people, q, meId]);

  const dropped: DroppedFile[] = files.map((f, i) => ({ id: `${i}-${f.name}`, name: f.name, mime: f.type, href: "" }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) {
      setErr("Тема совещания");
      return;
    }
    if (pick.size < 1) {
      setErr("Выберите, кто должен быть");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      let meetId = createdId;
      if (!meetId) {
        const startsAt = new Date(start);
        const endsAt = new Date(startsAt.getTime() + mins * 60 * 1000);
        const res = await fetch("/api/meet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            body: body.trim(),
            place: place.trim(),
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            participantIds: [...pick],
            visibility,
            viewerIds: [...viewers],
            destinations: ["meeting_card", ...[...dest].filter((d) => d !== "meeting_card")],
            recordConsent,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не создалось");
        meetId = data.id;
        setCreatedId(meetId);
      }
      for (const f of files) {
        await uploadMeetFile(meetId, f);
      }
      router.push(`/meet/${meetId}`);
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Ошибка");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Тема">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: план недели по E02" autoFocus />
          </Field>
          <Field label="Место">
            <div className="mb-2 flex flex-wrap gap-2">
              {MEET_PLACES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`rounded-full px-3 py-1 text-sm ${place === p ? "bg-navy text-white" : "bg-paper text-navy"}`}
                  onClick={() => setPlace(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <Input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Или своя комната" />
            {place === "Онлайн" || place === "Гибрид" ? (
              <p className="mt-2 text-xs text-muted">
                Кнопка «Войти в созвон» работает только в офисной сети. Из дома и через интернет — переговорка или отдельная ссылка, в Доке звонка не будет.
              </p>
            ) : null}
          </Field>
          <Field label="Начало">
            <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Длительность">
            <div className="flex flex-wrap gap-2">
              {MEET_DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`rounded-full px-3 py-1 text-sm ${mins === m ? "bg-navy text-white" : "bg-paper text-navy"}`}
                  onClick={() => setMins(m)}
                >
                  {m} мин
                </button>
              ))}
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Повестка" hint="Коротко, о чём речь. Файлы ниже — материалы, на которых строите разговор.">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Что обсуждаем, какие решения нужны" />
          </Field>
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-navy">Кто должен быть</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              className="rounded-full bg-paper px-3 py-1 text-sm text-navy"
              onClick={() => {
                setPick((prev) => {
                  const n = new Set(prev);
                  people.filter((p) => p.departmentName === d.name && p.id !== meId).forEach((p) => n.add(p.id));
                  return n;
                });
              }}
            >
              весь {d.name}
            </button>
          ))}
        </div>
        {pick.size ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {people
              .filter((p) => pick.has(p.id))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex items-center gap-2 rounded-full bg-navy/10 px-2 py-1 text-sm"
                  onClick={() =>
                    setPick((prev) => {
                      const n = new Set(prev);
                      n.delete(p.id);
                      return n;
                    })
                  }
                >
                  <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={20} />
                  {p.fullName}
                  <span className="text-muted">×</span>
                </button>
              ))}
          </div>
        ) : null}
        <Input className="mt-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по фамилии" />
        <ul className="mt-2 max-h-56 overflow-auto">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-paper"
                onClick={() =>
                  setPick((prev) => {
                    const n = new Set(prev);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  })
                }
              >
                <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-navy">{p.fullName}</span>
                  <span className="block text-xs text-muted">{p.departmentName || ""}</span>
                </span>
                {pick.has(p.id) ? <span className="text-sm text-gold">выбран</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-navy">Кто видит запись и сводку</h2>
        <div className="mt-3 grid gap-2">
          {[
            { id: "participants", label: "Только участники", hint: "Создатель и те, кого пригласили" },
            { id: "participants_and_managers", label: "Участники и руководство", hint: "Плюс руководители и админы" },
            { id: "custom", label: "Только выбранные люди", hint: "Создатель и отмеченные ниже" },
          ].map((o) => (
            <label key={o.id} className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2">
              <input type="radio" name="vis" checked={visibility === o.id} onChange={() => setVisibility(o.id)} className="mt-1" />
              <span>
                <span className="font-semibold text-navy">{o.label}</span>
                <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {visibility === "custom" ? (
          <div className="mt-3 max-h-40 overflow-auto">
            {people
              .filter((p) => p.id !== meId)
              .map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={viewers.has(p.id)}
                    onChange={() =>
                      setViewers((prev) => {
                        const n = new Set(prev);
                        if (n.has(p.id)) n.delete(p.id);
                        else n.add(p.id);
                        return n;
                      })
                    }
                  />
                  {p.fullName}
                </label>
              ))}
          </div>
        ) : null}
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-navy">Куда отправить готовую сводку</h2>
        <p className="mt-1 text-sm text-muted">После расшифровки записи. Карточка совещания всегда.</p>
        <div className="mt-3 grid gap-2">
          {[
            { id: "notify_participants", label: "Уведомление участникам" },
            { id: "attach_document", label: "Файл сводки в материалах совещания" },
          ].map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={dest.has(o.id)}
                onChange={() =>
                  setDest((prev) => {
                    const n = new Set(prev);
                    if (n.has(o.id)) n.delete(o.id);
                    else n.add(o.id);
                    return n;
                  })
                }
              />
              {o.label}
            </label>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={recordConsent} onChange={(e) => setRecordConsent(e.target.checked)} className="mt-1" />
          <span>Перед входом в созвон спрашивать согласие на запись</span>
        </label>
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-navy">Материалы</h2>
        <p className="text-sm text-muted">Презентация, раскадровка, смета — то, на чём будете говорить.</p>
        <div className="mt-3">
          <FileDrop
            files={dropped}
            onAdd={(list) => setFiles((prev) => [...prev, ...list])}
            onRemove={(id) => setFiles((prev) => prev.filter((f, i) => `${i}-${f.name}` !== id))}
            busy={busy}
            hint="pdf, картинки, Word, Excel"
          />
        </div>
      </Card>

      <ErrorText>{err}</ErrorText>
      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Созываем…" : "Созвать"}
        </Button>
        <Button type="button" variant="secondary" href="/meet">
          Отмена
        </Button>
      </div>
    </form>
  );
}

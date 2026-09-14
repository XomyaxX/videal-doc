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

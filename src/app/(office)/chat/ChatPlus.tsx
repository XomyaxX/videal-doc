"use client";

import { useState, type ReactNode } from "react";
import { ListChecks, ClipboardList, SquareCheckBig, X } from "lucide-react";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";

type Member = { id: string; fullName: string };

export function ChatPlus({
  chatId,
  members,
  meId,
  canProd,
  onClose,
  onCreated,
}: {
  chatId: string;
  members: Member[];
  meId: string;
  canProd?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [tab, setTab] = useState<"" | "poll" | "ask" | "task">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const others = members.filter((m) => m.id !== meId);

  async function post(url: string, body: unknown) {
    setBusy(true);
    setErr("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Не удалось создать");
      return;
    }
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-md overflow-auto rounded-t-3xl bg-card p-4 shadow-[var(--shadow)] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-xl text-navy">
            {tab === "poll" ? "Голосование" : tab === "ask" ? "Сбор ответов" : tab === "task" ? "Задача" : "Создать"}
          </h2>
          <button type="button" className="rounded-xl p-1 text-muted hover:bg-paper" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <ErrorText>{err}</ErrorText>
        {!tab ? (
          <div className="grid gap-2">
            <Choice icon={<ListChecks size={20} />} title="Голосование" hint="Вопрос и варианты, люди голосуют в чате" onClick={() => setTab("poll")} />
            <Choice
              icon={<ClipboardList size={20} />}
              title="Сбор ответов"
              hint="Пусть прикрепят файл или отметят «отправить пустым»"
              onClick={() => setTab("ask")}
            />
            <Choice icon={<SquareCheckBig size={20} />} title="Поручение" hint="Крупное или подзадача — попадёт в «Мои задачи»" onClick={() => setTab("task")} />
          </div>
        ) : null}

        {tab === "poll" ? (
          <PollForm busy={busy} onBack={() => setTab("")} onSubmit={(b) => void post(`/api/chat/${chatId}/polls`, b)} />
        ) : null}
        {tab === "ask" ? (
          <AskForm
            busy={busy}
            others={others}
            onBack={() => setTab("")}
            onSubmit={(b) => void post(`/api/chat/${chatId}/asks`, b)}
          />
        ) : null}
        {tab === "task" ? (
          <TaskForm
            busy={busy}
            others={others}
            meId={meId}
            canProd={canProd}
            onBack={() => setTab("")}
            onSubmit={(b) => void post(`/api/chat/${chatId}/tasks`, b)}
            chatId={chatId}
          />
        ) : null}
      </div>
    </div>
  );
}

function Choice({
  icon,
  title,
  hint,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-2xl border border-line bg-white p-3 text-left hover:border-gold"
    >
      <span className="mt-0.5 text-navy">{icon}</span>
      <span>
        <span className="block font-semibold text-navy">{title}</span>
        <span className="text-sm text-muted">{hint}</span>
      </span>
    </button>
  );
}

function PollForm({
  busy,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  onBack: () => void;
  onSubmit: (b: { question: string; options: string[]; multi: boolean }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multi, setMulti] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ question, options: options.map((o) => o.trim()).filter(Boolean), multi });
      }}
    >
      <Field label="Вопрос">
        <Input value={question} onChange={(e) => setQuestion(e.target.value)} required placeholder="Куда идём обедать?" />
      </Field>
      {options.map((o, i) => (
        <Field key={i} label={`Вариант ${i + 1}`}>
          <Input
            value={o}
            onChange={(e) => setOptions((list) => list.map((x, idx) => (idx === i ? e.target.value : x)))}
            placeholder="Ответ"
          />
        </Field>
      ))}
      {options.length < 10 ? (
        <button type="button" className="text-sm font-semibold text-gold" onClick={() => setOptions((l) => [...l, ""])}>
          Ещё вариант
        </button>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} />
        Можно несколько
      </label>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit" disabled={busy}>
          Опубликовать
        </Button>
      </div>
    </form>
  );
}

function AskForm({
  busy,
  others,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  others: Member[];
  onBack: () => void;
  onSubmit: (b: { title: string; body: string; userIds: string[] }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ids, setIds] = useState<string[]>(others.map((m) => m.id));
  function toggle(id: string) {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, body, userIds: ids });
      }}
    >
      <Field label="Что прислать" hint="Люди смогут прикрепить файл или отметить «отправить пустым»">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Скан паспорта / справка / ничего" />
      </Field>
      <Field label="Пояснение">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="До какого дня, в каком виде" />
      </Field>
      <div>
        <p className="mb-1 text-sm font-semibold text-navy">У кого собрать</p>
        <div className="max-h-40 space-y-1 overflow-auto rounded-xl border border-line bg-white p-2">
          {others.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-paper">
              <input type="checkbox" checked={ids.includes(m.id)} onChange={() => toggle(m.id)} />
              {m.fullName}
            </label>
          ))}
          {others.length === 0 ? <p className="px-2 py-1 text-sm text-muted">В чате только вы</p> : null}
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit" disabled={busy}>
          Разослать
        </Button>
      </div>
    </form>
  );
}

function TaskForm({
  busy,
  others,
  meId,
  canProd,
  chatId,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  others: Member[];
  meId: string;
  canProd?: boolean;
  chatId: string;
  onBack: () => void;
  onSubmit: (b: {
    title: string;
    body: string;
    assigneeId: string;
    dueAt: string;
    createProd: boolean;
    kind: "task" | "epic" | "sub";
    attachId: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [assigneeId, setAssigneeId] = useState(meId);
  const [dueAt, setDueAt] = useState("");
  const [createProd, setCreateProd] = useState(false);
  const [kind, setKind] = useState<"task" | "epic" | "sub">("task");
  const [attachId, setAttachId] = useState("");
  const [targets, setTargets] = useState<{ id: string; title: string }[]>([]);
  const [loadErr, setLoadErr] = useState("");

  async function loadTargets(uid: string) {
    setLoadErr("");
    const res = await fetch(`/api/chat/${chatId}/tasks/targets?userId=${encodeURIComponent(uid)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setTargets([]);
      setLoadErr(data.error || "Не удалось загрузить задачи");
      return;
    }
    const list = [...(data.peers || []), ...(data.jobs || []), ...(data.tasks || [])];
    setTargets(list);
    setAttachId(list[0]?.id || "");
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ title, body, assigneeId, dueAt, createProd, kind, attachId });
      }}
    >
      <Field label="Поручение">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Что сделать" />
      </Field>
      <Field label="Кому">
        <Select
          value={assigneeId}
          onChange={(e) => {
            const uid = e.target.value;
            setAssigneeId(uid);
            if (kind === "sub") void loadTargets(uid);
          }}
        >
          <option value={meId}>себе</option>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.fullName}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <label className={`rounded-xl border px-2 py-2 text-center text-sm ${kind === "task" ? "border-gold bg-[#fff8ec]" : "border-line bg-white"}`}>
          <input type="radio" className="sr-only" checked={kind === "task"} onChange={() => setKind("task")} />
          Новая задача
        </label>
        <label className={`rounded-xl border px-2 py-2 text-center text-sm ${kind === "epic" ? "border-gold bg-[#fff8ec]" : "border-line bg-white"}`}>
          <input type="radio" className="sr-only" checked={kind === "epic"} onChange={() => setKind("epic")} />
          Крупное
        </label>
        <label className={`rounded-xl border px-2 py-2 text-center text-sm ${kind === "sub" ? "border-gold bg-[#fff8ec]" : "border-line bg-white"}`}>
          <input
            type="radio"
            className="sr-only"
            checked={kind === "sub"}
            onChange={() => {
              setKind("sub");
              void loadTargets(assigneeId);
            }}
          />
          Подзадача
        </label>
      </div>
      {kind === "sub" ? (
        <Field label="К чему привязать" hint="Открытые поручения, крупные и пайплайн этого человека. Новых этапов на шоте не будет.">
          {loadErr ? <p className="text-sm text-bad">{loadErr}</p> : null}
          <Select value={attachId} onChange={(e) => setAttachId(e.target.value)} required>
            {targets.length === 0 ? <option value="">нет открытых задач</option> : null}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Срок">
        <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </Field>
      <Field label="Пояснение">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      {canProd && kind === "epic" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={createProd} onChange={(e) => setCreateProd(e.target.checked)} />
          Ещё создать крупную в производстве
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit" disabled={busy || (kind === "sub" && !attachId)}>
          Поставить
        </Button>
      </div>
    </form>
  );
}

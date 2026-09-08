"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, ImagePlus, Mic, Paperclip, Pin, Plus, Search, Send, Smile, Users, VolumeX } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button, ErrorText, Input } from "@/components/ui";
import { previewText, type ChatPayload } from "@/lib/chat-types";

type Person = {
  id: string;
  fullName: string;
  lastName: string;
  firstName: string;
  photoFileId: string;
  departmentName: string | null;
  lastSeenAt: string | null;
  role?: string;
  lastReadAt?: string | null;
};

type InboxChat = {
  id: string;
  kind: string;
  avatarFileId: string;
  title: string;
  lastMessageAt: string;
  unreadCount: number;
  mutedUntil: string | null;
  pinnedAt: string | null;
  role: string;
  adminView?: boolean;
  canWrite?: boolean;
  official?: boolean;
  noMute?: boolean;
  members: Person[];
  last?: { id: string; authorId: string; type: string; preview: string; createdAt: string } | null;
};

type Msg = {
  id: string;
  authorId: string;
  authorName: string;
  lastName: string;
  firstName: string;
  photoFileId: string;
  type: string;
  replyToId: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  payload: ChatPayload | null;
  blobs: { id: string; size: number; mime: string; originalName: string }[];
  reactions: { userId: string; emoji: string }[];
};

const EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "✅"];

function formatLastSeen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  if (Date.now() - d.getTime() < 3 * 60 * 1000) return "только что";
  return `был(а) ${d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

function shortTime(iso: string) {
  const d = new Date(iso);
  const same = new Date().toDateString() === d.toDateString();
  return d.toLocaleString("ru-RU", same ? { hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "short" });
}

function otherName(c: InboxChat, meId: string) {
  if (c.kind !== "direct") return c.title || (c.kind === "studio" ? "Студия" : "Беседа");
  return c.members.find((m) => m.id !== meId)?.fullName || "Диалог";
}

function GroupFace({ avatarFileId, title, size = 44 }: { avatarFileId: string; title: string; size?: number }) {
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-bold text-white"
      style={{ width: size, height: size }}
    >
      {(title || "Г")[0]}
      {avatarFileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/files/${avatarFileId}`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
    </span>
  );
}

function hiddenKey(chatId: string) {
  return `vd-chat-hide-${chatId}`;
}

export function ChatApp({
  me,
  chatId,
  isAdmin,
}: {
  me: { id: string; lastName: string; firstName: string; photoFileId: string; fullName: string };
  chatId?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [inbox, setInbox] = useState<InboxChat[]>([]);
  const [seeAll, setSeeAll] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState("");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [err, setErr] = useState("");

  const refreshInbox = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const res = await fetch(`/api/chat/inbox${seeAll && isAdmin ? "?all=1" : ""}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setInbox(data.chats || []);
  }, [seeAll, isAdmin]);

  useEffect(() => {
    void refreshInbox();
    const t = setInterval(() => void refreshInbox(), 8000);
    const vis = () => {
      if (document.visibilityState === "visible") void refreshInbox();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [refreshInbox]);

  async function openPeople(asGroup = false) {
    const res = await fetch("/api/chat/people");
    const data = await res.json().catch(() => ({}));
    setPeople(data.people || []);
    setGroupOpen(asGroup);
    setPeopleOpen(true);
  }

  async function startDirect(p: Person) {
    const existing = inbox.find((c) => c.kind === "direct" && c.members.some((m) => m.id === p.id));
    if (existing) {
      setPeopleOpen(false);
      router.push(`/chat/${existing.id}`);
      return;
    }
    const res = await fetch("/api/chat/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: p.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error || "Не открылось");
      return;
    }
    setPeopleOpen(false);
    router.push(`/chat/${data.id}`);
    void refreshInbox();
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return inbox.filter((c) => {
      if (unreadOnly && c.unreadCount < 1) return false;
      if (!s) return true;
      return otherName(c, me.id).toLowerCase().includes(s) || (c.last?.preview || "").toLowerCase().includes(s);
    });
  }, [inbox, q, me.id, unreadOnly]);

  return (
    <div className="flex min-h-0 flex-1 bg-paper">
      <aside className={`min-h-0 w-full flex-col border-r border-line bg-card md:flex md:w-[340px] md:shrink-0 ${chatId ? "hidden md:flex" : "flex"}`}>
        <div className="flex items-center gap-2 border-b border-line px-3 py-3">
          <h1 className="min-w-0 flex-1 font-serif text-2xl text-navy">Чаты</h1>
          <button type="button" className="rounded-xl p-2 hover:bg-paper" title="Написать" onClick={() => void openPeople(false)}>
            <Plus size={18} />
          </button>
          <button type="button" className="rounded-xl p-2 hover:bg-paper" title="Беседа" onClick={() => void openPeople(true)}>
            <Users size={18} />
          </button>
        </div>
        <div className="flex flex-wrap gap-2 px-3 pt-2 text-xs">
          <button
            type="button"
            className={`rounded-full px-2 py-1 ${unreadOnly ? "bg-navy text-white" : "bg-paper text-muted"}`}
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Непрочитанные
          </button>
          {isAdmin ? (
            <button
              type="button"
              className={`rounded-full px-2 py-1 ${seeAll ? "bg-navy text-white" : "bg-paper text-muted"}`}
              onClick={() => setSeeAll((v) => !v)}
            >
              Все чаты студии
            </button>
          ) : null}
        </div>
        <div className="px-3 py-2">
          <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3">
            <Search size={16} className="text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="w-full bg-transparent py-2 text-sm outline-none" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm text-muted">{unreadOnly ? "Всё прочитано." : "Пока пусто."}</p>
              <Button className="mt-3" type="button" onClick={() => void openPeople(false)}>
                Написать
              </Button>
            </div>
          ) : null}
          {filtered.map((c) => {
            const title = otherName(c, me.id);
            const other = c.members.find((m) => m.id !== me.id);
            const active = c.id === chatId;
            return (
              <Link
                key={c.id}
                href={`/chat/${c.id}`}
                className={`flex items-center gap-3 px-3 py-2.5 ${active ? "bg-paper" : "hover:bg-paper/70"}`}
              >
                {c.kind !== "direct" ? (
                  <GroupFace avatarFileId={c.avatarFileId} title={title} />
                ) : (
                  <Avatar photoFileId={other?.photoFileId} lastName={other?.lastName || "?"} firstName={other?.firstName || "?"} size={44} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`min-w-0 truncate text-sm ${c.unreadCount ? "font-bold text-navy" : "font-semibold text-navy"}`}>
                      {title}
                    </span>
                    {c.pinnedAt ? <Pin size={12} className="shrink-0 text-gold" /> : null}
                    {c.mutedUntil ? <VolumeX size={12} className="shrink-0 text-muted" /> : null}
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{shortTime(c.lastMessageAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted">{c.last?.preview || " "}</span>
                </span>
                {c.unreadCount > 0 ? (
                  <span className="rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-white">{c.unreadCount}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </aside>
      <section className={`min-h-0 min-w-0 flex-1 flex-col ${chatId ? "flex" : "hidden md:flex"}`}>
        {chatId ? (
          <Thread me={me} chatId={chatId} inbox={inbox} onChanged={() => void refreshInbox()} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-sm text-muted">
            <p>Выберите чат слева или напишите коллеге</p>
            <Button type="button" onClick={() => void openPeople(false)}>
              Написать
            </Button>
          </div>
        )}
      </section>
      {peopleOpen ? (
        <PeopleModal
          people={people}
          group={groupOpen}
          onClose={() => setPeopleOpen(false)}
          onDirect={(p) => void startDirect(p)}
          onGroupCreated={(id) => {
            setPeopleOpen(false);
            router.push(`/chat/${id}`);
            void refreshInbox();
          }}
        />
      ) : null}
      {err ? (
        <div className="absolute bottom-20 left-1/2 z-20 w-[min(28rem,90vw)] -translate-x-1/2">
          <ErrorText>{err}</ErrorText>
        </div>
      ) : null}
    </div>
  );
}

function PeopleModal({
  people,
  group,
  onClose,
  onDirect,
  onGroupCreated,
}: {
  people: Person[];
  group: boolean;
  onClose: () => void;
  onDirect: (p: Person) => void;
  onGroupCreated: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const rows = people.filter((p) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return p.fullName.toLowerCase().includes(s) || (p.departmentName || "").toLowerCase().includes(s);
  });

  async function createGroup() {
    if (busy) return;
    if (pick.size < 1) {
      setErr("Отметьте людей");
      return;
    }
    if (!title.trim()) {
      setErr("Название группы");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/chat/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberIds: [...pick], title: title.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Не создалось");
      onGroupCreated(data.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 md:items-center md:p-6">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-card p-4 shadow-[var(--shadow)] md:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-serif text-xl text-navy">{group ? "Новая беседа" : "Написать"}</p>
          <button type="button" className="text-sm text-muted" onClick={onClose}>
            Закрыть
          </button>
        </div>
        {group ? <Input className="mb-2" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название" /> : null}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по фамилии" autoFocus />
        <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-auto">
          {rows.map((p) => (
            <button
              key={p.id}
              type="button"
              className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-paper"
              onClick={() => {
                if (group) {
                  setPick((prev) => {
                    const n = new Set(prev);
                    if (n.has(p.id)) n.delete(p.id);
                    else n.add(p.id);
                    return n;
                  });
                } else onDirect(p);
              }}
            >
              <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-navy">{p.fullName}</span>
                <span className="block text-xs text-muted">{p.departmentName || ""}</span>
              </span>
              {group && pick.has(p.id) ? <Check size={16} className="text-ok" /> : null}
            </button>
          ))}
        </div>
        {group ? (
          <Button className="mt-3" disabled={busy} onClick={() => void createGroup()}>
            Создать беседу
          </Button>
        ) : null}
        <ErrorText>{err}</ErrorText>
      </div>
    </div>
  );
}

function Thread({
  me,
  chatId,
  inbox,
  onChanged,
}: {
  me: { id: string; lastName: string; firstName: string; photoFileId: string };
  chatId: string;
  inbox: InboxChat[];
  onChanged: () => void;
}) {
  const [chat, setChat] = useState<InboxChat | null>(inbox.find((c) => c.id === chatId) || null);
  const [rows, setRows] = useState<Msg[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<Msg | null>(null);
  const [info, setInfo] = useState(false);
  const [fwd, setFwd] = useState<ChatPayload | null>(null);
  const [reactFor, setReactFor] = useState<string | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [recOn, setRecOn] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const recChunks = useRef<Blob[]>([]);
  const recStarted = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [localQ, setLocalQ] = useState("");
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadChat = useCallback(async () => {
    const res = await fetch(`/api/chat/${chatId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setChat(data);
  }, [chatId]);

  const loadMsgs = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const res = await fetch(`/api/chat/${chatId}/messages`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const list = data.messages || [];
      setRows(list);
      setHasMore(list.length >= 50);
    }
  }, [chatId]);

  useEffect(() => {
    void loadChat();
    void loadMsgs();
    setBody(localStorage.getItem(`vd-chat-draft-${chatId}`) || "");
    try {
      const raw = JSON.parse(localStorage.getItem(hiddenKey(chatId)) || "[]");
      setHidden(new Set(Array.isArray(raw) ? raw : []));
    } catch {
      setHidden(new Set());
    }
    const t = setInterval(() => void loadMsgs(), 2500);
    const t2 = setInterval(() => void loadChat(), 10000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, [chatId, loadChat, loadMsgs]);

  useEffect(() => {
    if (body) localStorage.setItem(`vd-chat-draft-${chatId}`, body);
    else localStorage.removeItem(`vd-chat-draft-${chatId}`);
  }, [chatId, body]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [rows.length]);

  useEffect(() => {
    const last = rows[rows.length - 1];
    if (!last || chat?.adminView) return;
    void fetch(`/api/chat/${chatId}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: last.id }),
    }).then(onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, chatId]);

  const headerTitle = chat ? otherName(chat, me.id) : "Чат";
  const other = chat?.members.find((m) => m.id !== me.id);
  const canWrite = chat?.canWrite !== false && !chat?.adminView;

  async function send(payload: { type: string; text?: string; files?: ChatPayload["files"]; voice?: ChatPayload["voice"]; blobIds?: string[] }) {
    const res = await fetch(`/api/chat/${chatId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, replyToId: reply?.id || "", mentionIds }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Не отправилось");
    setRows((prev) => [...prev, data]);
    setReply(null);
    setMentionIds([]);
    onChanged();
  }

  async function loadOlder() {
    if (loadingMore || !hasMore || rows.length === 0) return;
    setLoadingMore(true);
    const first = rows[0];
    const box = listRef.current;
    const prevHeight = box?.scrollHeight || 0;
    const res = await fetch(`/api/chat/${chatId}/messages?before=${first.id}`);
    const data = await res.json().catch(() => ({}));
    const older: Msg[] = data.messages || [];
    setHasMore(older.length >= 50);
    if (older.length) {
      setRows((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...older.filter((m) => !seen.has(m.id)), ...prev];
      });
      requestAnimationFrame(() => {
        if (box) box.scrollTop = box.scrollHeight - prevHeight;
      });
    }
    setLoadingMore(false);
  }

  async function sendText(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await send({ type: "text", text: body.trim() });
      setBody("");
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Ошибка");
    }
    setBusy(false);
  }

  async function sendFiles(list: FileList | File[]) {
    setBusy(true);
    try {
      const files: NonNullable<ChatPayload["files"]> = [];
      const ids: string[] = [];
      for (const f of Array.from(list)) {
        const fd = new FormData();
        fd.set("file", f, f.name);
        const res = await fetch(`/api/chat/${chatId}/blobs`, { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Файл не ушёл");
        files.push({ blobId: data.id, name: f.name, mime: f.type || "application/octet-stream", size: f.size });
        ids.push(data.id);
      }
      await send({ type: "file", files, blobIds: ids });
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Ошибка");
    }
    setBusy(false);
  }

  async function toggleRec() {
    if (recOn) {
      recRef.current?.stop();
      setRecOn(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunks.current = [];
      recStarted.current = Date.now();
      rec.ondataavailable = (ev) => {
        if (ev.data.size) recChunks.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recChunks.current, { type: rec.mimeType || "audio/webm" });
        const dur = Date.now() - recStarted.current;
        void (async () => {
          const fd = new FormData();
          fd.set("file", new File([blob], "voice.webm", { type: blob.type }));
          const res = await fetch(`/api/chat/${chatId}/blobs`, { method: "POST", body: fd });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return;
          await send({
            type: "voice",
            voice: { blobId: data.id, mime: blob.type, durationMs: dur },
            blobIds: [data.id],
          });
        })();
      };
      recRef.current = rec;
      rec.start();
      setRecOn(true);
    } catch {
      setErr("Нет доступа к микрофону");
    }
  }

  const visible = rows.filter((m) => !hidden.has(m.id)).filter((m) => {
    const s = localQ.trim().toLowerCase();
    if (!s) return true;
    return (m.payload?.text || "").toLowerCase().includes(s) || m.authorName.toLowerCase().includes(s);
  });

  return (
    <>
      <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
        <Link href="/chat" className="rounded-xl p-2 hover:bg-paper md:hidden" aria-label="Назад">
          <ArrowLeft size={18} />
        </Link>
        {chat && chat.kind !== "direct" ? (
          <button type="button" onClick={() => setInfo(true)}>
            <GroupFace avatarFileId={chat.avatarFileId} title={headerTitle} size={40} />
          </button>
        ) : (
          <Avatar photoFileId={other?.photoFileId} lastName={other?.lastName || "?"} firstName={other?.firstName || "?"} size={40} />
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => chat && chat.kind !== "direct" && setInfo(true)}>
          <span className="block truncate font-semibold text-navy">{headerTitle}</span>
          <span className="block truncate text-xs text-muted">
            {chat?.adminView
              ? "просмотр админа"
              : chat && chat.kind !== "direct"
                ? `${chat.members.length} чел.${chat.kind === "studio" ? " · общий чат" : chat.kind === "dept" ? " · отдел" : ""}`
                : formatLastSeen(other?.lastSeenAt || null)}
          </span>
        </button>
        {canWrite ? (
          <>
            <button
              type="button"
              className="rounded-xl p-2 hover:bg-paper"
              title={chat?.pinnedAt ? "Открепить" : "Закрепить"}
              onClick={async () => {
                await fetch(`/api/chat/${chatId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ pinned: !chat?.pinnedAt }),
                });
                onChanged();
                void loadChat();
              }}
            >
              <Pin size={16} />
            </button>
            {chat?.kind === "studio" || chat?.noMute ? null : (
            <button
              type="button"
              className="rounded-xl p-2 hover:bg-paper"
              title={chat?.mutedUntil ? "Включить звук" : "Без звука"}
              onClick={async () => {
                await fetch(`/api/chat/${chatId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ muted: !chat?.mutedUntil }),
                });
                void loadChat();
              }}
            >
              <VolumeX size={16} />
            </button>
            )}
          </>
        ) : null}
      </header>
      <div className="px-3 py-1">
        <input
          value={localQ}
          onChange={(e) => setLocalQ(e.target.value)}
          placeholder="Найти в этой переписке"
          className="w-full rounded-xl border border-line bg-white px-3 py-1.5 text-xs"
        />
      </div>
      <div
        ref={listRef}
        className="min-h-0 flex-1 space-y-2 overflow-auto px-3 py-2"
        onScroll={(e) => {
          if (e.currentTarget.scrollTop < 48) void loadOlder();
        }}
      >
        {hasMore && rows.length > 0 ? (
          <button type="button" className="block w-full py-1 text-center text-xs text-muted underline" onClick={() => void loadOlder()}>
            {loadingMore ? "Загружаем…" : "Ещё раньше"}
          </button>
        ) : null}
        {visible.map((m) => {
          const mine = m.authorId === me.id;
          const p = m.payload;
          const readAt = chat?.kind === "direct" ? other?.lastReadAt : null;
          const read = Boolean(mine && readAt && new Date(readAt) >= new Date(m.createdAt));
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-xl px-3 py-2 ${mine ? "bg-paper" : "border border-line bg-white"}`}>
                {!mine && chat?.kind === "group" ? (
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-navy">
                    <Avatar photoFileId={m.photoFileId} lastName={m.lastName} firstName={m.firstName} size={18} />
                    {m.authorName}
                  </div>
                ) : null}
                {m.deletedAt ? (
                  <p className="text-sm italic text-muted">Сообщение удалено</p>
                ) : p ? (
                  <PayloadView payload={p} rows={rows} />
                ) : (
                  <p className="text-sm text-muted">Не удалось прочитать</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-muted">
                  <span>
                    {shortTime(m.createdAt)}
                    {m.editedAt ? " · прав." : ""}
                  </span>
                  {mine ? read ? <CheckCheck size={12} /> : <Check size={12} /> : null}
                  {m.reactions.map((r) => (
                    <span key={r.userId + r.emoji} className="rounded-full bg-white px-1">
                      {r.emoji}
                    </span>
                  ))}
                  {!m.deletedAt && canWrite ? (
                    <>
                      <button type="button" className="underline" onClick={() => setReply(m)}>
                        ответ
                      </button>
                      {mine ? (
                        <button
                          type="button"
                          className="underline"
                          onClick={async () => {
                            if (!confirm("Удалить у всех?")) return;
                            await fetch(`/api/chat/${chatId}/messages/${m.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ delete: true }),
                            });
                            void loadMsgs();
                          }}
                        >
                          удалить
                        </button>
                      ) : null}
                      {mine && p?.t === "text" && Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000 ? (
                        <button
                          type="button"
                          className="underline"
                          onClick={async () => {
                            const next = window.prompt("Текст", p.text || "");
                            if (next == null) return;
                            await fetch(`/api/chat/${chatId}/messages/${m.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ text: next }),
                            });
                            void loadMsgs();
                          }}
                        >
                          править
                        </button>
                      ) : null}
                      {p ? (
                        <button type="button" className="underline" onClick={() => setFwd(p)}>
                          переслать
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          setHidden((prev) => {
                            const n = new Set(prev);
                            n.add(m.id);
                            localStorage.setItem(hiddenKey(chatId), JSON.stringify([...n]));
                            return n;
                          });
                        }}
                      >
                        скрыть
                      </button>
                      <button type="button" className="rounded p-0.5 hover:bg-paper" onClick={() => setReactFor(reactFor === m.id ? null : m.id)}>
                        <Smile size={12} />
                      </button>
                      {reactFor === m.id
                        ? EMOJI.map((e) => (
                            <button
                              key={e}
                              type="button"
                              onClick={() =>
                                void fetch(`/api/chat/${chatId}/messages/${m.id}/reactions`, {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ emoji: e }),
                                }).then(() => {
                                  setReactFor(null);
                                  void loadMsgs();
                                })
                              }
                            >
                              {e}
                            </button>
                          ))
                        : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {reply ? (
        <div className="flex items-center gap-2 border-t border-line bg-white px-3 py-1 text-xs text-muted">
          Ответ: {(reply.payload?.text || "сообщение").slice(0, 60)}
          <button type="button" onClick={() => setReply(null)}>
            ×
          </button>
        </div>
      ) : null}
      {canWrite ? (
        <form className="border-t border-line bg-card p-3" onSubmit={(e) => void sendText(e)}>
          <ErrorText>{err}</ErrorText>
          {(() => {
            const at = body.match(/@([^\s@]*)$/);
            if (!at || !chat) return null;
            const q = at[1].toLowerCase();
            const pick = chat.members.filter(
              (m) => m.id !== me.id && `${m.lastName} ${m.firstName}`.toLowerCase().includes(q),
            );
            if (!pick.length) return null;
            return (
              <ul className="mb-2 max-h-36 overflow-auto rounded-xl border border-line bg-white">
                {pick.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper"
                      onClick={() => {
                        setBody((prev) => prev.replace(/@([^\s@]*)$/, `@${p.lastName} `));
                        setMentionIds((prev) => (prev.includes(p.id) ? prev : [...prev, p.id]));
                      }}
                    >
                      <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={24} />
                      {p.fullName}
                    </button>
                  </li>
                ))}
              </ul>
            );
          })()}
          <div className="flex items-end gap-2">
            <label className="rounded-xl p-2 hover:bg-paper" title="Файл">
              <Paperclip size={18} />
              <input
                type="file"
                multiple
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) void sendFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <label className="rounded-xl p-2 hover:bg-paper" title="Фото">
              <ImagePlus size={18} />
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  if (e.target.files) void sendFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (!busy) void sendText();
              }}
              placeholder="Сообщение. @фамилия — тег, тогда человеку придёт пуш"
              rows={1}
              className="min-h-[44px] max-h-32 flex-1 resize-none rounded-xl border border-line bg-white px-3 py-2"
            />
            <button type="button" className={`rounded-xl p-2 ${recOn ? "bg-bad text-white" : "hover:bg-paper"}`} title="Голос" onClick={() => void toggleRec()}>
              <Mic size={18} />
            </button>
            <button type="submit" disabled={busy} className="rounded-xl bg-navy p-2 text-white" title="Отправить">
              <Send size={18} />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">Enter — отправить. Пуш только если человека тегнули через @</p>
        </form>
      ) : (
        <p className="border-t border-line bg-card px-3 py-3 text-sm text-muted">Просмотр. Писать может участник чата.</p>
      )}
      {fwd ? (
        <div className="fixed inset-0 z-50 flex items-end bg-navy/40 md:items-center md:justify-center">
          <div className="max-h-[70vh] w-full max-w-md overflow-auto rounded-t-3xl bg-card p-4 md:rounded-2xl">
            <div className="mb-3 flex justify-between">
              <p className="font-serif text-xl text-navy">Переслать</p>
              <button type="button" className="text-sm text-muted" onClick={() => setFwd(null)}>
                Закрыть
              </button>
            </div>
            {inbox.map((c) => (
              <button
                key={c.id}
                type="button"
                className="block w-full rounded-xl px-2 py-2 text-left hover:bg-paper"
                onClick={async () => {
                  const blobIds: string[] = [];
                  const next: ChatPayload = { ...fwd, replyTo: undefined };
                  if (next.files?.length) {
                    const copied = [];
                    for (const f of next.files) {
                      const bin = await fetch(`/api/chat/blobs/${f.blobId}`);
                      if (!bin.ok) continue;
                      const fd = new FormData();
                      fd.set("file", new File([await bin.blob()], f.name, { type: f.mime }));
                      const up = await fetch(`/api/chat/${c.id}/blobs`, { method: "POST", body: fd });
                      const d = await up.json().catch(() => ({}));
                      if (!up.ok) continue;
                      copied.push({ ...f, blobId: d.id });
                      blobIds.push(d.id);
                    }
                    next.files = copied;
                  }
                  if (next.voice) {
                    const bin = await fetch(`/api/chat/blobs/${next.voice.blobId}`);
                    if (bin.ok) {
                      const fd = new FormData();
                      fd.set("file", new File([await bin.blob()], "voice.webm", { type: next.voice.mime }));
                      const up = await fetch(`/api/chat/${c.id}/blobs`, { method: "POST", body: fd });
                      const d = await up.json().catch(() => ({}));
                      if (up.ok) {
                        next.voice = { ...next.voice, blobId: d.id };
                        blobIds.push(d.id);
                      }
                    }
                  }
                  await fetch(`/api/chat/${c.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ type: next.t, text: next.text, files: next.files, voice: next.voice, blobIds }),
                  });
                  setFwd(null);
                }}
              >
                {otherName(c, me.id)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {info && chat && chat.kind !== "direct" ? (
        <GroupInfo
          chat={chat}
          meId={me.id}
          onClose={() => setInfo(false)}
          onChanged={() => {
            void loadChat();
            onChanged();
          }}
        />
      ) : null}
    </>
  );
}

function PayloadView({ payload, rows }: { payload: ChatPayload; rows: Msg[] }) {
  if (payload.t === "system") {
    return <p className="text-center text-xs italic text-muted">{previewText(payload)}</p>;
  }
  const quoted = payload.replyTo ? rows.find((r) => r.id === payload.replyTo)?.payload : null;
  return (
    <div>
      {payload.replyTo ? (
        <p className="mb-1 border-l-2 border-gold pl-2 text-xs text-muted">{quoted?.text?.slice(0, 80) || "ответ"}</p>
      ) : null}
      {payload.text ? (
        <p className="whitespace-pre-wrap text-sm">
          {payload.text.split(/(@\S+)/g).map((part, i) =>
            part.startsWith("@") ? (
              <span key={i} className="font-semibold text-gold">
                {part}
              </span>
            ) : (
              <span key={i}>{part}</span>
            ),
          )}
        </p>
      ) : null}
      {payload.files?.map((f) => {
        const url = `/api/chat/blobs/${f.blobId}`;
        if (f.mime.startsWith("image/")) {
          return (
            <a key={f.blobId} href={url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={f.name} className="mt-2 max-h-56 rounded-lg object-contain" />
            </a>
          );
        }
        if (f.mime.startsWith("video/")) {
          return <video key={f.blobId} src={url} controls className="mt-2 max-h-56 w-full rounded-lg bg-black" />;
        }
        return (
          <a key={f.blobId} href={url} className="mt-2 inline-block text-sm font-semibold text-navy underline">
            {f.name}
          </a>
        );
      })}
      {payload.voice ? (
        <div className="mt-1">
          <audio src={`/api/chat/blobs/${payload.voice.blobId}`} controls className="w-full" />
          <p className="text-[11px] text-muted">{Math.round(payload.voice.durationMs / 1000)} сек</p>
        </div>
      ) : null}
    </div>
  );
}

function GroupInfo({
  chat,
  meId,
  onClose,
  onChanged,
}: {
  chat: InboxChat;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const official = chat.kind === "studio" || chat.kind === "dept" || chat.official;
  const admin =
    !official && ((chat.role === "owner" || chat.role === "admin") || Boolean(chat.adminView));
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState(chat.title || "");
  const [err, setErr] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy/40 md:items-center md:justify-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-3xl bg-card p-4 md:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-serif text-xl text-navy">Беседа</p>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            Закрыть
          </button>
        </div>
        <div className="flex items-center gap-3">
          <GroupFace avatarFileId={chat.avatarFileId} title={chat.title || "Группа"} />
          {admin ? (
            <label className="text-sm font-semibold text-navy underline">
              Фото группы
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.set("file", file);
                  await fetch(`/api/chat/${chat.id}/avatar`, { method: "POST", body: fd });
                  onChanged();
                }}
              />
            </label>
          ) : null}
        </div>
        {admin ? (
          <div className="mt-3 flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const res = await fetch(`/api/chat/${chat.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ title: name.trim() }),
                });
                if (!res.ok) setErr("Не переименовалось");
                else onChanged();
              }}
            >
              Ок
            </Button>
          </div>
        ) : (
          <p className="mt-3 font-semibold text-navy">{chat.title}</p>
        )}
        {official ? (
          <p className="mt-2 text-sm text-muted">
            {chat.kind === "studio"
              ? "Общий чат студии. Состав — все сотрудники. Выйти нельзя. Пуш от руководства не выключается."
              : "Чат отдела. Кто в этом отделе — тот здесь. Выйти нельзя. Пуш от руководства приходит даже если чат без звука."}
          </p>
        ) : null}
        <p className="mt-4 text-sm font-semibold text-navy">Участники</p>
        <ul className="mt-2 space-y-2">
          {chat.members.map((m) => (
            <li key={m.id} className="flex items-center gap-2">
              <Avatar photoFileId={m.photoFileId} lastName={m.lastName} firstName={m.firstName} size={32} />
              <span className="flex-1 text-sm">
                {m.fullName}
                <span className="text-xs text-muted"> {m.role === "owner" ? "· владелец" : m.role === "admin" ? "· админ" : ""}</span>
              </span>
              {admin && m.id !== meId && m.role !== "owner" ? (
                <button
                  type="button"
                  className="text-xs text-bad"
                  onClick={() =>
                    void fetch(`/api/chat/${chat.id}/members`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ remove: m.id }),
                    }).then(onChanged)
                  }
                >
                  убрать
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {admin ? (
          <div className="mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                const res = await fetch("/api/chat/people");
                const data = await res.json().catch(() => ({}));
                setPeople(data.people || []);
              }}
            >
              Добавить людей
            </Button>
            <ul className="mt-2 max-h-40 overflow-auto">
              {people
                .filter((p) => !chat.members.some((m) => m.id === p.id))
                .map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="py-1 text-sm underline"
                      onClick={() =>
                        void fetch(`/api/chat/${chat.id}/members`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ add: [p.id] }),
                        }).then(onChanged)
                      }
                    >
                      {p.fullName}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {!chat.adminView && !official ? (
          <Button
            className="mt-4"
            variant="danger"
            onClick={async () => {
              if (!confirm("Выйти из беседы?")) return;
              await fetch(`/api/chat/${chat.id}/members`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ leave: true }),
              });
              window.location.href = "/chat";
            }}
          >
            Выйти
          </Button>
        ) : null}
        <ErrorText>{err}</ErrorText>
      </div>
    </div>
  );
}

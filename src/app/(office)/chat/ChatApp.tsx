"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCheck, Forward, ImagePlus, Paperclip, Pencil, Pin, Plus, Reply, Search, Send, Users, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Button, ErrorText, Input } from "@/components/ui";
import { previewText, type ChatAskDto, type ChatPayload, type ChatPollDto, type ChatTaskDto } from "@/lib/chat-types";
import { CHAT_EMOJI, LEAD_EMOJI, messageMatchesQuery } from "@/lib/chat-emoji";
import { dayKey, dayLabel, splitMessageText } from "@/lib/chat-media";
import { filesFromClipboard } from "@/lib/clipboard-files";
import { uploadChunkedFile } from "@/lib/meet-upload";
import { AskCard, PollCard, TaskCard } from "./ChatCards";
import { ChatMedia, PhotoLightbox } from "./ChatMedia";
import { ChatPlus } from "./ChatPlus";
import { VoicePlayer } from "./VoicePlayer";
import { VoiceRecorder } from "./VoiceRecorder";
import { GlbPreview, ModelPreview } from "@/components/ModelPreview";
import { isModel3dName, needsGlbPreview, previewMode } from "@/lib/library-kinds";

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
  poll?: ChatPollDto;
  ask?: ChatAskDto;
  task?: ChatTaskDto;
};

const EMOJI = [...CHAT_EMOJI];

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
  canLead,
  canAward,
}: {
  me: { id: string; lastName: string; firstName: string; photoFileId: string; fullName: string };
  chatId?: string;
  isAdmin?: boolean;
  canLead?: boolean;
  canAward?: boolean;
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
          <Thread me={me} chatId={chatId} inbox={inbox} canLead={canLead} canAward={canAward} onChanged={() => void refreshInbox()} />
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
  canLead,
  canAward,
  onChanged,
}: {
  me: { id: string; lastName: string; firstName: string; photoFileId: string };
  chatId: string;
  inbox: InboxChat[];
  canLead?: boolean;
  canAward?: boolean;
  onChanged: () => void;
}) {
  const [chat, setChat] = useState<InboxChat | null>(inbox.find((c) => c.id === chatId) || null);
  const [rows, setRows] = useState<Msg[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<Msg | null>(null);
  const [info, setInfo] = useState(false);
  const [fwd, setFwd] = useState<ChatPayload | null>(null);
  const [edit, setEdit] = useState<Msg | null>(null);
  const [msgMenu, setMsgMenu] = useState<{ msg: Msg; x: number; y: number } | null>(null);
  const [plusOpen, setPlusOpen] = useState(false);
  const holdTimer = useRef<number | null>(null);
  const [mentionIds, setMentionIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);
  const [photo, setPhoto] = useState<{ src: string; alt: string; kind?: "image" | "model3d" } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [flashId, setFlashId] = useState("");
  const [pending, setPending] = useState<{ id: string; file: File; url: string }[]>([]);
  const [upload, setUpload] = useState<{ pct: number; phase: "upload" | "convert"; name: string } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const rowsRef = useRef<Msg[]>([]);
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
    return () => {
      setPending((prev) => {
        for (const p of prev) if (p.url) URL.revokeObjectURL(p.url);
        return [];
      });
    };
  }, [chatId]);

  useEffect(() => {
    if (body) localStorage.setItem(`vd-chat-draft-${chatId}`, body);
    else localStorage.removeItem(`vd-chat-draft-${chatId}`);
  }, [chatId, body]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [rows.length]);

  useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 192)}px`;
  }, [body, voiceOn]);

  useEffect(() => {
    if (!msgMenu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMsgMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [msgMenu]);

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

  function patchRow(id: string, part: Partial<Msg>) {
    setRows((prev) => prev.map((m) => (m.id === id ? { ...m, ...part } : m)));
  }

  function groupedReactions(list: Msg["reactions"]) {
    const map = new Map<string, { emoji: string; count: number; me: boolean }>();
    for (const r of list) {
      const cur = map.get(r.emoji) || { emoji: r.emoji, count: 0, me: false };
      cur.count += 1;
      if (r.userId === me.id) cur.me = true;
      map.set(r.emoji, cur);
    }
    return [...map.values()];
  }

  async function toggleReact(mid: string, emoji: string) {
    await fetch(`/api/chat/${chatId}/messages/${mid}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    setMsgMenu(null);
    void loadMsgs();
  }

  function canEditMsg(m: Msg) {
    return (
      m.authorId === me.id &&
      !m.deletedAt &&
      m.payload?.t === "text" &&
      Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000
    );
  }

  function openMsgMenu(clientX: number, clientY: number, m: Msg) {
    if (m.deletedAt || !canWrite) return;
    const w = 280;
    const h = 380;
    const pad = 8;
    let x = clientX;
    let y = clientY;
    if (x + w > window.innerWidth - pad) x = Math.max(pad, window.innerWidth - w - pad);
    if (y + h > window.innerHeight - pad) y = Math.max(pad, window.innerHeight - h - pad);
    setMsgMenu({ msg: m, x, y });
  }

  function menuFromEvent(e: { clientX: number; clientY: number; target: EventTarget | null }, m: Msg) {
    const el = e.target as HTMLElement | null;
    if (el?.closest("button, a, input, textarea, label, select")) return;
    openMsgMenu(e.clientX, e.clientY, m);
  }

  function scrollToMsg(id: string) {
    const el = document.getElementById(`msg-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setFlashId(id);
    window.setTimeout(() => setFlashId((cur) => (cur === id ? "" : cur)), 1600);
  }

  async function jumpToMsg(id: string) {
    setInfo(false);
    if (rowsRef.current.some((m) => m.id === id)) {
      requestAnimationFrame(() => scrollToMsg(id));
      return;
    }
    const res = await fetch(`/api/chat/${chatId}/messages?around=${id}`);
    const data = await res.json().catch(() => ({}));
    const extra: Msg[] = data.messages || [];
    if (extra.length) {
      setRows((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of extra) map.set(m.id, m);
        return [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
    }
    requestAnimationFrame(() => scrollToMsg(id));
  }

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

  function queueFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => f.size > 0);
    if (!incoming.length) return;
    setPending((prev) => [
      ...prev,
      ...incoming.map((file, i) => ({
        id: `${Date.now()}-${prev.length + i}-${file.name}`,
        file,
        url: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      })),
    ]);
  }

  function dropPending(id: string) {
    setPending((prev) => {
      const hit = prev.find((p) => p.id === id);
      if (hit?.url) URL.revokeObjectURL(hit.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  function clearPending() {
    setPending((prev) => {
      for (const p of prev) if (p.url) URL.revokeObjectURL(p.url);
      return [];
    });
  }

  async function sendText(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (edit) {
      if (!body.trim()) return;
      setBusy(true);
      setErr("");
      try {
        const res = await fetch(`/api/chat/${chatId}/messages/${edit.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: body.trim() }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Не удалось править");
        setEdit(null);
        setBody("");
        void loadMsgs();
      } catch (er) {
        setErr(er instanceof Error ? er.message : "Ошибка");
      }
      setBusy(false);
      return;
    }
    if (!body.trim() && !pending.length) return;
    setBusy(true);
    setErr("");
    setUpload({ pct: 0, phase: "upload", name: pending[0]?.file.name || "" });
    try {
      const files: NonNullable<ChatPayload["files"]> = [];
      const ids: string[] = [];
      for (const p of pending) {
        const data = await uploadChunkedFile(`/api/chat/${chatId}/blobs`, p.file, setUpload);
        if (!data.id) throw new Error("Файл не ушёл");
        files.push({
          blobId: String(data.id),
          name: p.file.name,
          mime: p.file.type || "application/octet-stream",
          size: p.file.size,
          previewBlobId: data.previewId ? String(data.previewId) : undefined,
        });
        ids.push(String(data.id));
      }
      await send({
        type: files.length ? "file" : "text",
        text: body.trim() || undefined,
        files: files.length ? files : undefined,
        blobIds: ids.length ? ids : undefined,
      });
      setBody("");
      clearPending();
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Ошибка");
    }
    setUpload(null);
    setBusy(false);
  }

  async function sendVoice(take: { blob: Blob; mime: string; durationMs: number; text: string }) {
    setBusy(true);
    setErr("");
    try {
      const ext = (take.mime || "").includes("mp4") ? "m4a" : "webm";
      const fd = new FormData();
      fd.set("file", new File([take.blob], `voice.${ext}`, { type: take.mime || "audio/webm" }));
      const res = await fetch(`/api/chat/${chatId}/blobs`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Голос не ушёл");
      await send({
        type: "voice",
        voice: {
          blobId: data.id,
          mime: take.mime || "audio/webm",
          durationMs: take.durationMs,
          text: take.text || undefined,
        },
        blobIds: [data.id],
      });
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Ошибка");
    }
    setBusy(false);
  }

  const visible = rows.filter((m) => !hidden.has(m.id)).filter((m) => messageMatchesQuery(m, localQ));
  const dragDepth = useRef(0);

  function fileDrag(e: React.DragEvent) {
    return [...e.dataTransfer.types].includes("Files");
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (!canWrite || !fileDrag(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (!canWrite || !fileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        const files = filesFromClipboard(e.dataTransfer);
        if (files.length) queueFiles(files);
      }}
    >
      {canWrite && dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-none border-2 border-dashed border-gold bg-gold/15">
          <p className="rounded-xl bg-white px-4 py-2 font-semibold text-navy">Отпустите, чтобы прикрепить</p>
        </div>
      ) : null}
      <header className="flex items-center gap-2 border-b border-line bg-card px-3 py-2">
        <Link href="/chat" className="rounded-xl p-2 hover:bg-paper md:hidden" aria-label="Назад">
          <ArrowLeft size={18} />
        </Link>
        {chat && chat.kind !== "direct" ? (
          <button type="button" onClick={() => setInfo(true)}>
            <GroupFace avatarFileId={chat.avatarFileId} title={headerTitle} size={40} />
          </button>
        ) : (
          <button type="button" onClick={() => setInfo(true)}>
            <Avatar photoFileId={other?.photoFileId} lastName={other?.lastName || "?"} firstName={other?.firstName || "?"} size={40} />
          </button>
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => chat && setInfo(true)}>
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
          placeholder="Поиск: слова, фамилия или эмодзи (кубок, золото…)"
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
        {visible.map((m, i) => {
          const mine = m.authorId === me.id;
          const p = m.payload;
          const readAt = chat?.kind === "direct" ? other?.lastReadAt : null;
          const read = Boolean(mine && readAt && new Date(readAt) >= new Date(m.createdAt));
          const quoted = !m.deletedAt && (m.replyToId || p?.replyTo) ? rows.find((r) => r.id === (m.replyToId || p?.replyTo)) : null;
          const reacts = groupedReactions(m.reactions);
          const prev = visible[i - 1];
          const showDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
          return (
            <div key={m.id}>
            {showDay ? (
              <p className="my-2 text-center text-[11px] font-semibold text-muted">{dayLabel(m.createdAt)}</p>
            ) : null}
            <div id={`msg-${m.id}`} className={`relative flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`${p?.files?.length || p?.voice ? "w-[min(85%,20rem)]" : "max-w-[85%]"} rounded-2xl px-3 py-2 ${mine ? "bg-paper" : "border border-line bg-white"} ${flashId === m.id ? "ring-2 ring-gold" : ""}`}
                onContextMenu={(e) => {
                  if (m.deletedAt || !canWrite) return;
                  e.preventDefault();
                  menuFromEvent(e, m);
                }}
                onTouchStart={(e) => {
                  if (m.deletedAt || !canWrite) return;
                  const t = e.touches[0];
                  if (holdTimer.current) window.clearTimeout(holdTimer.current);
                  holdTimer.current = window.setTimeout(() => openMsgMenu(t.clientX, t.clientY, m), 450);
                }}
                onTouchMove={() => {
                  if (holdTimer.current) {
                    window.clearTimeout(holdTimer.current);
                    holdTimer.current = null;
                  }
                }}
                onTouchEnd={() => {
                  if (holdTimer.current) {
                    window.clearTimeout(holdTimer.current);
                    holdTimer.current = null;
                  }
                }}
              >
                {!mine && chat?.kind !== "direct" ? (
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-navy">
                    <Avatar photoFileId={m.photoFileId} lastName={m.lastName} firstName={m.firstName} size={18} />
                    {m.authorName}
                  </div>
                ) : null}
                {quoted ? (
                  <button
                    type="button"
                    className="mb-1 w-full rounded-lg border-l-2 border-gold bg-white/70 px-2 py-1 text-left"
                    onClick={() => scrollToMsg(quoted.id)}
                  >
                    <span className="block text-[11px] font-semibold text-gold">{quoted.authorName}</span>
                    <span className="block truncate text-xs text-muted">
                      {quoted.payload?.text || quoted.payload?.voice?.text || quoted.poll?.question || quoted.ask?.title || quoted.task?.title || (quoted.payload?.t === "voice" ? "Голосовое" : "сообщение")}
                    </span>
                  </button>
                ) : null}
                {m.deletedAt ? (
                  <p className="text-sm italic text-muted">Сообщение удалено</p>
                ) : m.poll ? (
                  <PollCard chatId={chatId} poll={m.poll} meId={me.id} onUpdate={(poll) => patchRow(m.id, { poll })} />
                ) : m.ask ? (
                  <AskCard chatId={chatId} ask={m.ask} meId={me.id} onUpdate={(ask) => patchRow(m.id, { ask })} />
                ) : m.task ? (
                  <TaskCard chatId={chatId} task={m.task} meId={me.id} onUpdate={(task) => patchRow(m.id, { task })} />
                ) : p ? (
                  <PayloadView payload={p} onOpenPhoto={setPhoto} />
                ) : (
                  <p className="text-sm text-muted">Не удалось прочитать</p>
                )}
                {reacts.length ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {reacts.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        disabled={!canWrite}
                        onClick={() => void toggleReact(m.id, r.emoji)}
                        className={`rounded-full px-1.5 py-0.5 text-xs ${
                          r.me ? "bg-gold/20 ring-1 ring-gold" : "bg-white"
                        }`}
                      >
                        {r.emoji} {r.count > 1 ? r.count : ""}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted">
                  <span>
                    {shortTime(m.createdAt)}
                    {m.editedAt ? " · прав." : ""}
                  </span>
                  {mine ? read ? <CheckCheck size={12} /> : <Check size={12} /> : null}
                </div>
              </div>
            </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>
      {msgMenu ? (
        <div className="fixed inset-0 z-[70]" onClick={() => setMsgMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMsgMenu(null); }}>
          <div
            className="absolute w-[min(18rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-line bg-card shadow-[var(--shadow)]"
            style={{ left: msgMenu.x, top: msgMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap justify-center gap-1 border-b border-line px-2 py-2">
              {EMOJI.map((e) => (
                <button
                  key={e}
                  type="button"
                  className="rounded-full px-1.5 py-1 text-lg hover:bg-paper"
                  onClick={() => void toggleReact(msgMenu.msg.id, e)}
                >
                  {e}
                </button>
              ))}
            </div>
            {canAward ? (
              <div className="border-b border-line px-2 py-2">
                <p className="mb-1 text-center text-[11px] font-semibold text-gold">Награды руководителя</p>
                <div className="flex flex-wrap justify-center gap-1">
                  {LEAD_EMOJI.map((e) => (
                    <button
                      key={e}
                      type="button"
                      title={e === "🏆" ? "Кубок" : e === "🎆" ? "Фейерверк" : e === "🎁" ? "Подарок" : e === "🥇" ? "Золото" : e === "🥈" ? "Серебро" : "Бронза"}
                      className="rounded-full px-1.5 py-1 text-lg hover:bg-[#fff8ec]"
                      onClick={() => void toggleReact(msgMenu.msg.id, e)}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-paper"
              onClick={() => {
                setEdit(null);
                setReply(msgMenu.msg);
                setMsgMenu(null);
              }}
            >
              <Reply size={16} /> Ответить
            </button>
            {msgMenu.msg.payload ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-paper"
                onClick={() => {
                  setFwd(msgMenu.msg.payload);
                  setMsgMenu(null);
                }}
              >
                <Forward size={16} /> Переслать
              </button>
            ) : null}
            {canEditMsg(msgMenu.msg) ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-paper"
                onClick={() => {
                  setReply(null);
                  setEdit(msgMenu.msg);
                  setBody(msgMenu.msg.payload?.text || "");
                  setMsgMenu(null);
                }}
              >
                <Pencil size={16} /> Изменить
              </button>
            ) : null}
            {msgMenu.msg.authorId === me.id ? (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-bad hover:bg-paper"
                onClick={async () => {
                  setMsgMenu(null);
                  if (!confirm("Удалить у всех?")) return;
                  await fetch(`/api/chat/${chatId}/messages/${msgMenu.msg.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ delete: true }),
                  });
                  void loadMsgs();
                }}
              >
                Удалить
              </button>
            ) : null}
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-muted hover:bg-paper"
              onClick={() => {
                setHidden((prev) => {
                  const n = new Set(prev);
                  n.add(msgMenu.msg.id);
                  localStorage.setItem(hiddenKey(chatId), JSON.stringify([...n]));
                  return n;
                });
                setMsgMenu(null);
              }}
            >
              Скрыть у себя
            </button>
          </div>
        </div>
      ) : null}
      {edit ? (
        <div className="flex items-center gap-2 border-t border-line bg-white px-3 py-2">
          <Pencil size={16} className="shrink-0 text-gold" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gold">Редактирование</p>
            <p className="truncate text-xs text-muted">{edit.payload?.text || "сообщение"}</p>
          </div>
          <button
            type="button"
            className="text-muted"
            onClick={() => {
              setEdit(null);
              setBody("");
            }}
          >
            ×
          </button>
        </div>
      ) : null}
      {reply && !edit ? (
        <div className="flex items-center gap-2 border-t border-line bg-white px-3 py-2">
          <span className="h-10 w-1 shrink-0 rounded-full bg-gold" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gold">Ответ · {reply.authorName}</p>
            <p className="truncate text-xs text-muted">
              {reply.payload?.text || reply.payload?.voice?.text || reply.poll?.question || reply.ask?.title || reply.task?.title || (reply.payload?.t === "voice" ? "Голосовое" : "сообщение")}
            </p>
          </div>
          <button type="button" className="text-muted" onClick={() => setReply(null)}>
            ×
          </button>
        </div>
      ) : null}
      {canWrite ? (
        <form
          className="relative border-t border-line bg-card p-3"
          onSubmit={(e) => void sendText(e)}
          onPaste={(e) => {
            const files = filesFromClipboard(e.clipboardData);
            if (!files.length) return;
            e.preventDefault();
            queueFiles(files);
          }}
        >
          <ErrorText>{err}</ErrorText>
          {upload ? (
            <div className="mb-2">
              <p className="mb-1 text-[11px] text-muted">
                {upload.phase === "convert" ? `Конвертация 3D: ${upload.name}` : `Загрузка ${upload.name} — ${upload.pct}%`}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-paper">
                <div className="h-full bg-gold transition-all" style={{ width: `${upload.phase === "convert" ? 100 : upload.pct}%` }} />
              </div>
            </div>
          ) : null}
          {pending.length ? (
            <ul className="mb-2 flex flex-wrap gap-2">
              {pending.map((p) => (
                <li key={p.id} className="relative">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.url} alt={p.file.name} className="h-16 w-16 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-16 max-w-[9rem] items-center rounded-lg bg-paper px-2 text-[11px] text-navy">{p.file.name}</span>
                  )}
                  <button
                    type="button"
                    className="absolute -right-1 -top-1 rounded-full bg-navy p-0.5 text-white"
                    title="Убрать"
                    onClick={() => dropPending(p.id)}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
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
            {!edit && !voiceOn ? (
              <button type="button" className="rounded-xl p-2 hover:bg-paper" title="Голосование, сбор, задача" onClick={() => setPlusOpen(true)}>
                <Plus size={18} />
              </button>
            ) : null}
            {!edit && !voiceOn ? (
              <>
                <label className="rounded-xl p-2 hover:bg-paper" title="Файл">
                  <Paperclip size={18} />
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      if (e.target.files) queueFiles(e.target.files);
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
                      if (e.target.files) queueFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              </>
            ) : null}
            {voiceOn ? null : (
              <textarea
                ref={taRef}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                onPaste={(e) => {
                  const files = filesFromClipboard(e.clipboardData);
                  if (!files.length) return;
                  e.preventDefault();
                  e.stopPropagation();
                  queueFiles(files);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  if (!busy) void sendText();
                }}
                placeholder={edit ? "Измените сообщение" : "Сообщение. @фамилия — тег, тогда человеку придёт пуш"}
                rows={1}
                className="min-h-[44px] max-h-48 flex-1 resize-none overflow-y-auto rounded-xl border border-line bg-white px-3 py-2"
              />
            )}
            {!edit ? (
              <VoiceRecorder
                disabled={busy}
                hideMic={Boolean(body.trim() || pending.length)}
                onSend={(take) => void sendVoice(take)}
                onError={setErr}
                onActive={setVoiceOn}
              />
            ) : null}
            {edit || body.trim() || pending.length ? (
              <button type="submit" disabled={busy} className="rounded-xl bg-navy p-2 text-white" title="Отправить">
                <Send size={18} />
              </button>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] text-muted">Enter — отправить. Shift+Enter — новая строка. Голос — зажать микрофон.</p>
        </form>
      ) : (
        <p className="border-t border-line bg-card px-3 py-3 text-sm text-muted">Просмотр. Писать может участник чата.</p>
      )}
      {plusOpen && chat ? (
        <ChatPlus
          chatId={chatId}
          members={chat.members.map((m) => ({ id: m.id, fullName: m.fullName }))}
          meId={me.id}
          canProd={canLead}
          onClose={() => setPlusOpen(false)}
          onCreated={() => {
            void loadMsgs();
            onChanged();
          }}
        />
      ) : null}
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
      {info && chat ? (
        <GroupInfo
          chat={chat}
          meId={me.id}
          onClose={() => setInfo(false)}
          onJump={(id) => void jumpToMsg(id)}
          onChanged={() => {
            void loadChat();
            onChanged();
          }}
        />
      ) : null}
      {photo ? <PhotoLightbox src={photo.src} alt={photo.alt} kind={photo.kind} onClose={() => setPhoto(null)} /> : null}
    </div>
  );
}

function PayloadView({
  payload,
  onOpenPhoto,
}: {
  payload: ChatPayload;
  onOpenPhoto: (photo: { src: string; alt: string; kind?: "image" | "model3d" }) => void;
}) {
  if (payload.t === "system") {
    return <p className="text-center text-xs italic text-muted">{previewText(payload)}</p>;
  }
  return (
    <div>
      {payload.text ? (
        <p className="whitespace-pre-wrap text-sm">
          {splitMessageText(payload.text).map((part, i) =>
            part.t === "url" ? (
              <a key={i} href={part.href} target="_blank" rel="noreferrer" className="break-all font-semibold text-navy underline">
                {part.value}
              </a>
            ) : part.t === "mention" ? (
              <span key={i} className="font-semibold text-gold">
                {part.value}
              </span>
            ) : (
              <span key={i}>{part.value}</span>
            ),
          )}
        </p>
      ) : null}
      {payload.files?.map((f) => {
        const url = `/api/chat/blobs/${f.blobId}`;
        const mode = f.previewBlobId || isModel3dName(f.name, f.mime) ? "model3d" : previewMode({ mimeType: f.mime, originalName: f.name });
        if (mode === "image" || f.mime.startsWith("image/")) {
          return (
            <button
              key={f.blobId}
              type="button"
              className="mt-2 block w-full overflow-hidden rounded-xl"
              onClick={() => onOpenPhoto({ src: url, alt: f.name, kind: "image" })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={f.name} className="block max-h-80 w-full object-contain" />
            </button>
          );
        }
        if (mode === "video" || f.mime.startsWith("video/")) {
          return <video key={f.blobId} src={url} controls className="mt-2 max-h-80 w-full rounded-xl bg-black" />;
        }
        if (mode === "model3d") {
          return (
            <div key={f.blobId} className="relative mt-2 overflow-hidden rounded-xl">
              {needsGlbPreview(f.name) || f.previewBlobId ? (
                <GlbPreview src={`${url}?preview=1`} compact />
              ) : (
                <ModelPreview src={url} compact />
              )}
              <button
                type="button"
                className="absolute right-2 top-2 rounded-lg bg-navy/80 px-2 py-1 text-[11px] font-semibold text-white"
                onClick={() =>
                  onOpenPhoto({
                    src: needsGlbPreview(f.name) || f.previewBlobId ? `${url}?preview=1` : url,
                    alt: f.name,
                    kind: "model3d",
                  })
                }
              >
                На весь экран
              </button>
              <a href={url} download={f.name} className="absolute bottom-2 left-2 rounded-lg bg-navy/80 px-2 py-1 text-[11px] font-semibold text-white">
                Скачать оригинал
              </a>
            </div>
          );
        }
        return (
          <a key={f.blobId} href={url} download={f.name} className="mt-2 inline-block text-sm font-semibold text-navy underline">
            {f.name}
          </a>
        );
      })}
      {payload.voice ? (
        <div className="mt-1">
          <VoicePlayer src={`/api/chat/blobs/${payload.voice.blobId}`} durationMs={payload.voice.durationMs} text={payload.voice.text} />
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
  onJump,
}: {
  chat: InboxChat;
  meId: string;
  onClose: () => void;
  onChanged: () => void;
  onJump: (messageId: string) => void;
}) {
  const official = chat.kind === "studio" || chat.kind === "dept" || chat.official;
  const direct = chat.kind === "direct";
  const other = chat.members.find((m) => m.id !== meId);
  const admin =
    !direct && !official && ((chat.role === "owner" || chat.role === "admin") || Boolean(chat.adminView));
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState(chat.title || "");
  const [err, setErr] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-navy/40 md:items-center md:justify-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-3xl bg-card p-4 md:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-serif text-xl text-navy">{direct ? "Диалог" : "Беседа"}</p>
          <button type="button" onClick={onClose} className="text-sm text-muted">
            Закрыть
          </button>
        </div>
        <div className="flex items-center gap-3">
          {direct && other ? (
            <Avatar photoFileId={other.photoFileId} lastName={other.lastName} firstName={other.firstName} size={56} />
          ) : (
            <GroupFace avatarFileId={chat.avatarFileId} title={chat.title || "Группа"} />
          )}
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
          <p className="mt-3 font-semibold text-navy">{direct ? other?.fullName || "Диалог" : chat.title}</p>
        )}
        {direct ? <p className="text-xs text-muted">{formatLastSeen(other?.lastSeenAt || null)}</p> : null}
        {official ? (
          <p className="mt-2 text-sm text-muted">
            {chat.kind === "studio"
              ? "Общий чат студии. Состав — все сотрудники. Выйти нельзя. Пуш от руководства не выключается."
              : "Чат отдела. Кто в этом отделе — тот здесь. Выйти нельзя. Пуш от руководства приходит даже если чат без звука."}
          </p>
        ) : null}
        {direct ? null : <p className="mt-4 text-sm font-semibold text-navy">Участники</p>}
        {direct ? null : (
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
        )}
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
        {!direct && !chat.adminView && !official ? (
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
        <ChatMedia chatId={chat.id} onJump={onJump} />
        <ErrorText>{err}</ErrorText>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Boxes,
  ClipboardCheck,
  Clapperboard,
  FileStack,
  FilePenLine,
  FileText,
  Home,
  Inbox,
  Library,
  Menu,
  MessageCircle,
  Package,
  Settings,
  Users,
  UserRound,
  X,
} from "lucide-react";
import { AccountSwitcher } from "./AccountSwitcher";
import { cn } from "./ui";
import type { SessionUser } from "@/lib/types";
import { userCan } from "@/lib/types";

const SECTIONS = [
  { id: "day", label: "День" },
  { id: "work", label: "Работа" },
  { id: "papers", label: "Бумаги" },
  { id: "office", label: "Офис" },
  { id: "cabinet", label: "Кабинет" },
] as const;

const NAV = [
  { href: "/", label: "Мне нужно", icon: Home, perm: null, section: "day" },
  { href: "/chat", label: "Чаты", icon: MessageCircle, perm: null, section: "day" },
  { href: "/prod", label: "Производство", icon: Clapperboard, perm: "prod.view" as const, section: "work" },
  { href: "/library", label: "Хранилище", icon: Library, perm: "prod.work" as const, section: "work" },
  { href: "/calendar", label: "Календарь", icon: CalendarDays, perm: null, section: "work" },
  { href: "/documents", label: "Документы", icon: FileText, perm: null, section: "papers" },
  { href: "/registry", label: "Журнал", icon: Inbox, perm: null, section: "papers" },
  { href: "/requests", label: "Запросы", icon: Package, perm: "requests.create" as const, section: "papers" },
  { href: "/statements", label: "Заявления", icon: FilePenLine, perm: "hrdocs.create" as const, section: "papers" },
  { href: "/finance", label: "Финансы", icon: FileStack, perm: "finance.create" as const, section: "papers" },
  { href: "/employees", label: "Сотрудники", icon: Users, perm: "users.view" as const, section: "office" },
  { href: "/inventory", label: "Инвентарь", icon: Boxes, perm: null, section: "office" },
  { href: "/control", label: "Контроль", icon: ClipboardCheck, perm: "presence.review" as const, section: "office" },
  { href: "/profile", label: "Профиль", icon: UserRound, perm: null, section: "cabinet" },
  { href: "/admin", label: "Админка", icon: Settings, perm: "users.manage" as const, section: "cabinet" },
];

function itemActive(href: string, path: string) {
  const inFinance = ["/scan", "/advances", "/funds"].some((p) => path.startsWith(p));
  if (href === "/") return path === "/";
  if (href === "/finance") return path.startsWith("/finance") || inFinance;
  if (href === "/prod") return path.startsWith("/prod");
  if (href === "/library") return path.startsWith("/library");
  if (href === "/documents") return path.startsWith("/documents");
  if (href === "/registry") return path.startsWith("/registry");
  if (href === "/requests") return path.startsWith("/requests");
  if (href === "/statements") return path.startsWith("/statements");
  if (href === "/profile") return path.startsWith("/profile");
  return path.startsWith(href);
}

function NavLink({
  href,
  label,
  icon: Icon,
  path,
  onClick,
  badge,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  path: string;
  onClick?: () => void;
  badge?: number;
}) {
  const active = itemActive(href, path);
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px]",
        active ? "bg-white/15 font-semibold" : "text-white/80 hover:bg-white/10",
      )}
    >
      <Icon size={18} />
      {label}
      {badge && badge > 0 ? (
        <span className="ml-auto rounded-full bg-gold px-2 py-0.5 text-xs font-bold">{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </Link>
  );
}

export function AppShell({
  user,
  unread,
  chatUnread = 0,
  orgShort = "ООО «Видеаль Медиа»",
  children,
}: {
  user: SessionUser;
  unread: number;
  chatUnread?: number;
  orgShort?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const isChat = path.startsWith("/chat");
  const items = NAV.filter((i) => !i.perm || userCan(user, i.perm));
  const [more, setMore] = useState(false);
  const [liveChat, setLiveChat] = useState(chatUnread);
  useEffect(() => {
    setLiveChat(chatUnread);
  }, [chatUnread]);
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState === "hidden") return;
      const res = await fetch("/api/chat/me");
      const data = await res.json().catch(() => ({}));
      if (typeof data.unread === "number") setLiveChat(data.unread);
    };
    const t = setInterval(() => void tick(), 8000);
    return () => clearInterval(t);
  }, []);
  const tabs = [
    items.find((i) => i.href === "/"),
    items.find((i) => i.href === "/chat"),
    items.find((i) => i.href === "/prod"),
  ].filter(Boolean) as typeof NAV;
  const moreActive = more || !tabs.some((t) => itemActive(t.href, path));

  return (
    <div className={cn("flex min-h-full", isChat && "h-dvh overflow-hidden")}>
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col bg-navy text-white md:flex">
        <div className="px-5 pb-4 pt-6">
          <div className="stamp text-[11px] text-gold-2">{orgShort}</div>
          <div className="font-serif text-2xl leading-none">Видеал.Док</div>
          <div className="mt-1 text-xs text-white/60">Электронный документооборот</div>
        </div>
        <nav className="flex-1 space-y-3 overflow-y-auto px-3">
          {SECTIONS.map((sec) => {
            const rows = items.filter((i) => i.section === sec.id);
            if (!rows.length) return null;
            return (
              <div key={sec.id}>
                <div className="stamp px-3 pb-1 text-[10px] text-white/40">{sec.label}</div>
                <div className="space-y-1">
                  {rows.map((item) => (
                    <NavLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={item.icon}
                      path={path}
                      badge={item.href === "/chat" ? liveChat : 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <Link href="/notifications" className="mb-2 flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-white/10">
            <Bell size={16} />
            Уведомления
            {unread > 0 ? (
              <span className="ml-auto rounded-full bg-gold px-2 py-0.5 text-xs font-bold">{unread}</span>
            ) : null}
          </Link>
          <AccountSwitcher
            currentName={user.fullName}
            currentLogin={user.login}
            roleName={user.roleName}
            photoFileId={user.photoFileId}
            lastName={user.lastName}
            firstName={user.firstName}
          />
        </div>
      </aside>

      <header className="fixed inset-x-0 top-0 z-40 flex items-center gap-3 bg-navy px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white md:hidden">
        <div className="min-w-0 flex-1">
          <div className="stamp text-[10px] text-gold-2">{orgShort}</div>
          <div className="font-serif text-lg leading-none">Видеал.Док</div>
        </div>
        <Link href="/notifications" className="relative rounded-xl p-2 hover:bg-white/10" aria-label="Уведомления">
          <Bell size={20} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold leading-4">
              {unread}
            </span>
          ) : null}
        </Link>
      </header>

      <div className={cn("flex min-w-0 flex-1 flex-col pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-0", isChat && "min-h-0")}>
        {user.login === "lyudmila" ? (
          <div className="bg-gold px-4 py-2 text-center text-sm font-semibold text-white md:px-6">
            Демо-контур Видеал.Док — данные учебные, можно нажимать всё. Боевых документов здесь нет.
          </div>
        ) : null}
        <main
          className={
            isChat
              ? "flex min-h-0 w-full flex-1 flex-col p-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
              : "mx-auto w-full max-w-6xl flex-1 px-4 py-5 pb-24 md:px-6 md:py-8 md:pb-8"
          }
        >
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-navy text-white md:hidden pb-[env(safe-area-inset-bottom)]">
        {tabs.map((item) => {
          const active = !more && itemActive(item.href, path);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMore(false)}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 text-[11px]",
                active ? "font-semibold text-white" : "text-white/70",
              )}
            >
              <span className="relative">
                <Icon size={20} />
                {item.href === "/chat" && liveChat > 0 ? (
                  <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-gold px-1 text-center text-[10px] font-bold leading-4">
                    {liveChat > 99 ? "99+" : liveChat}
                  </span>
                ) : null}
              </span>
              {item.label === "Мне нужно" ? "Мне" : item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMore((v) => !v)}
          className={cn(
            "flex flex-1 flex-col items-center gap-1 py-2 text-[11px]",
            moreActive ? "font-semibold text-white" : "text-white/70",
          )}
        >
          <Menu size={20} />
          Ещё
        </button>
      </nav>

      {more ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-navy/50" aria-label="Закрыть" onClick={() => setMore(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-3xl bg-navy pb-[env(safe-area-inset-bottom)] text-white">
            <div className="flex items-center justify-between px-5 pt-4">
              <p className="font-serif text-xl">Ещё</p>
              <button type="button" className="rounded-xl p-2 hover:bg-white/10" onClick={() => setMore(false)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <nav className="space-y-3 px-3 py-3">
              {SECTIONS.map((sec) => {
                const rows = items.filter((i) => i.section === sec.id);
                if (!rows.length) return null;
                return (
                  <div key={sec.id}>
                    <div className="stamp px-3 pb-1 text-[10px] text-white/40">{sec.label}</div>
                    <div className="space-y-1">
                      {rows.map((item) => (
                        <NavLink
                          key={item.href}
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                          path={path}
                          onClick={() => setMore(false)}
                          badge={item.href === "/chat" ? liveChat : 0}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </nav>
            <div className="border-t border-white/10 p-3">
              <AccountSwitcher
            currentName={user.fullName}
            currentLogin={user.login}
            roleName={user.roleName}
            photoFileId={user.photoFileId}
            lastName={user.lastName}
            firstName={user.firstName}
          />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

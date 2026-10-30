import type { SessionUser } from "./types";
import { userCan } from "./types";
import { userDeptNames } from "./prod";

export const PIPE_DEPTS = ["mult", "maksarg", "smm", "events"] as const;
export type PipeDept = (typeof PIPE_DEPTS)[number];

export const PIPE_DEPT_LABEL: Record<PipeDept, string> = {
  mult: "Мульт продакшн",
  maksarg: "Максарг",
  smm: "SMM",
  events: "Events",
};

const DEPT_ALIASES: Record<PipeDept, string[]> = {
  mult: ["анимация", "производство", "сценарий", "мульт", "mult", "мультипликация"],
  maksarg: ["максарг", "maksarg"],
  smm: ["smm", "смм", "маркетинг"],
  events: ["events", "мероприятия", "ивенты", "event"],
};

export const PIPE_UI_STATUS: Record<string, string> = {
  todo: "not_ready",
  appoint: "to_appoint",
  wip: "in_progress",
  done: "done",
  blocked: "waiting",
  revise: "toedit",
  approved: "acces",
};

export const PIPE_STATUS_LABEL: Record<string, string> = {
  todo: "Не готово",
  appoint: "Не готово",
  wip: "В работе",
  done: "Готово",
  blocked: "Ожидание",
  revise: "На правках",
  approved: "Утверждено",
};

export const PIPE_WORKER_STATUSES = ["todo", "wip", "done", "blocked"] as const;
export const PIPE_MANAGER_STATUSES = ["todo", "wip", "done", "blocked", "revise", "approved"] as const;

export function pipeLiveStatus(status: string) {
  return status === "appoint" ? "todo" : status;
}

export const PIPE_DAY_PX = 80;

export function isPipeDept(raw: string | null | undefined): raw is PipeDept {
  return PIPE_DEPTS.includes(String(raw) as PipeDept);
}

export function isPipeManager(user: { roleCode: string; permissions?: string[] }) {
  if (["manager", "sublead", "admin", "superadmin"].includes(user.roleCode)) return true;
  const perms = { roleCode: user.roleCode, permissions: user.permissions || [] };
  return userCan(perms, "prod.manage") || userCan(perms, "prod.lead");
}

export function deptFromName(name?: string | null): PipeDept | null {
  const n = (name || "").trim().toLowerCase();
  if (!n) return null;
  for (const dept of PIPE_DEPTS) {
    if (DEPT_ALIASES[dept].includes(n)) return dept;
  }
  return null;
}

/** Extra pipeline tabs a department can open. Access matrix is still a mess; this is the stopgap. */
const PIPE_DEPT_SHARE: Partial<Record<PipeDept, PipeDept[]>> = {
  smm: ["events"],
};

export function userPipeDepts(user: SessionUser): PipeDept[] {
  if (isPipeManager(user) || user.prodScope === "studio") return [...PIPE_DEPTS];
  const names = userDeptNames(user);
  const out: PipeDept[] = [];
  for (const name of names) {
    const d = deptFromName(name);
    if (d && !out.includes(d)) out.push(d);
  }
  for (const d of [...out]) {
    for (const extra of PIPE_DEPT_SHARE[d] || []) {
      if (!out.includes(extra)) out.push(extra);
    }
  }
  return out.length ? out : [...PIPE_DEPTS];
}

export function defaultPipeDept(user: SessionUser): PipeDept {
  const allowed = userPipeDepts(user);
  const own = deptFromName(user.departmentName);
  if (own && allowed.includes(own)) return own;
  return allowed[0] || "mult";
}

export function pipeProgress(tasks: { status: string; deletedAt?: Date | null }[]) {
  const live = tasks.filter((t) => !t.deletedAt);
  if (!live.length) return 0;
  const ok = live.filter((t) => t.status === "approved").length;
  return Math.round((ok / live.length) * 100);
}

export function sortPipeTasks<T extends { status: string }>(tasks: T[], manager: boolean): T[] {
  const rank = (status: string) => {
    if (manager && status === "done") return 0;
    if (status === "revise" || status === "wip" || status === "blocked" || status === "todo" || status === "appoint") {
      return manager ? 1 : 0;
    }
    if (status === "done") return 1;
    if (status === "approved") return 2;
    return 3;
  };
  return [...tasks].sort((a, b) => rank(a.status) - rank(b.status) || 0);
}

export function weekdaysBetween(from: Date, to: Date) {
  const days: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) days.push(ymd(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

export function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

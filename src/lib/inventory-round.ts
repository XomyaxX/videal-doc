/** Чистая логика тура обхода. Без Prisma, чтобы её можно было прогнать скриптом. */

export type EmployeeGate = { status: string; deletedAt: Date | null };

export type RoundAuditRef = {
  id: string;
  userId: string;
  status: string;
  roundId: string | null;
};

export type RoundPerson = { id: string; name: string };

export type RoundRoster = {
  pending: RoundPerson[];
  inProgress: Array<RoundPerson & { auditId: string }>;
  done: Array<RoundPerson & { auditId: string }>;
  checked: number;
  total: number;
};

export type RoundNext = { userId: string; name: string; auditId: string | null };

export type RoundWalk = {
  id: string;
  number: string;
  checked: number;
  total: number;
  next: RoundNext | null;
};

export function isActiveEmployee(person: EmployeeGate | null): boolean {
  return Boolean(person && person.deletedAt == null && person.status === "active");
}

/** Серверный отказ для субъекта аудита и для получателя при передаче. */
export function employeeBlockReason(person: EmployeeGate | null, kind: "subject" | "recipient"): string | null {
  if (!person || person.deletedAt != null) {
    return kind === "recipient" ? "Нет такого сотрудника" : "Выберите сотрудника";
  }
  if (person.status !== "active") {
    return kind === "recipient"
      ? "Передать можно только действующему сотруднику"
      : "Сотрудник не работает — инвентаризацию по нему не открываем";
  }
  return null;
}

export function classifyInRound(
  audits: RoundAuditRef[],
  userId: string,
  roundId: string,
): { state: "pending" | "open" | "done"; auditId: string | null } {
  const open = audits.find((a) => a.userId === userId && a.status === "open");
  if (open) return { state: "open", auditId: open.id };
  const done = audits.find((a) => a.userId === userId && a.status === "done" && a.roundId === roundId);
  if (done) return { state: "done", auditId: done.id };
  return { state: "pending", auditId: null };
}

/** Люди уже отсортированы вызывающим кодом (фамилия, имя) — порядок тура совпадает со списком. */
export function buildRoundRoster(people: RoundPerson[], audits: RoundAuditRef[], roundId: string): RoundRoster {
  const pending: RoundPerson[] = [];
  const inProgress: Array<RoundPerson & { auditId: string }> = [];
  const done: Array<RoundPerson & { auditId: string }> = [];
  for (const person of people) {
    const mark = classifyInRound(audits, person.id, roundId);
    if (mark.state === "open" && mark.auditId) inProgress.push({ ...person, auditId: mark.auditId });
    else if (mark.state === "done" && mark.auditId) done.push({ ...person, auditId: mark.auditId });
    else pending.push(person);
  }
  return { pending, inProgress, done, checked: done.length, total: people.length };
}

/**
 * Следующий непроверенный после afterUserId (с заворотом на начало списка).
 * Сам afterUserId пропускается: это сотрудник, которого только что закрыли.
 */
export function nextUnchecked(
  people: RoundPerson[],
  audits: RoundAuditRef[],
  roundId: string,
  afterUserId?: string | null,
): RoundNext | null {
  if (!people.length) return null;
  let start = 0;
  if (afterUserId) {
    const idx = people.findIndex((p) => p.id === afterUserId);
    if (idx >= 0) start = idx + 1;
  }
  for (let step = 0; step < people.length; step++) {
    const person = people[(start + step) % people.length];
    if (afterUserId && person.id === afterUserId) continue;
    const mark = classifyInRound(audits, person.id, roundId);
    if (mark.state === "done") continue;
    return { userId: person.id, name: person.name, auditId: mark.auditId };
  }
  return null;
}

export function decideRoundStart(openRound: { id: string } | null):
  | { ok: true }
  | { ok: false; status: number; error: string; roundId: string } {
  if (openRound) return { ok: false, status: 409, error: "Уже есть открытый тур", roundId: openRound.id };
  return { ok: true };
}

export type AuditStartDecision =
  | { type: "reject"; status: number; error: string }
  | { type: "resume"; auditId: string; setRoundId: string | null }
  | { type: "create"; roundId: string | null };

export function decideAuditStart(opts: {
  person: EmployeeGate | null;
  openRoundId: string | null;
  openAudit: { id: string; roundId: string | null } | null;
  doneInOpenRound: boolean;
}): AuditStartDecision {
  const block = employeeBlockReason(opts.person, "subject");
  if (block) return { type: "reject", status: 400, error: block };
  if (opts.openAudit) {
    const setRoundId =
      opts.openRoundId && opts.openAudit.roundId !== opts.openRoundId ? opts.openRoundId : null;
    return { type: "resume", auditId: opts.openAudit.id, setRoundId };
  }
  if (opts.openRoundId && opts.doneInOpenRound) {
    return { type: "reject", status: 409, error: "Сотрудник уже проверен в этом туре" };
  }
  return { type: "create", roundId: opts.openRoundId };
}

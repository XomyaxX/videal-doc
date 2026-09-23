import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Button, Pill } from "@/components/ui";
import { officeYmd, officeClock, fmtTimeOmsk, fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { flagLabel } from "@/lib/presence";
import { FlagOk } from "./FlagOk";
import { ControlSearch } from "./ControlSearch";
import { USER_SAFE_SELECT } from "@/lib/user-public";
import { Avatar } from "@/components/Avatar";
import { STAGE_LABEL, STATUS_LABEL, STATUS_PILL } from "@/lib/prod";
import { taskTitle } from "@/lib/prod-server";
import { stationOnline } from "@/lib/office-lan";

function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

const OPEN = new Set(["wip", "revise", "blocked"]);
const DONE = new Set(["done", "approved"]);
const OPEN_ORDER = ["wip", "revise", "blocked"];
const TABS = ["people", "review", "late", "flags", "time"] as const;
type Tab = (typeof TABS)[number];

type TaskRow = {
  id: string;
  assigneeId: string | null;
  stage: string;
  status: string;
  title: string | null;
  dueAt: Date | null;
  updatedAt: Date;
  shot: { code: string } | null;
  scene: { code: string; title: string } | null;
  asset: { name: string } | null;
  episode: { code: string } | null;
  job: { title: string } | null;
};

function labelOf(t: TaskRow) {
  const base = taskTitle(t);
  if (t.job?.title && !t.title?.trim()) return `${t.job.title} · ${base}`;
  return base;
}

function tabCls(on: boolean) {
  return `rounded-xl px-3 py-2 text-sm font-semibold ${on ? "bg-navy !text-white" : "border border-line bg-white text-navy hover:border-gold"}`;
}

function hit(q: string, parts: Array<string | null | undefined>) {
  const n = q.trim().toLocaleLowerCase("ru");
  if (!n) return true;
  return parts
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("ru")
    .includes(n);
}

function hrefFor(opts: { tab: Tab; from: string; to: string; q: string }) {
  const p = new URLSearchParams();
  if (opts.tab !== "people") p.set("tab", opts.tab);
  p.set("from", opts.from);
  p.set("to", opts.to);
  if (opts.q.trim()) p.set("q", opts.q.trim());
  const qs = p.toString();
  return qs ? `/control?${qs}` : "/control";
}

export default async function ControlPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; tab?: string; q?: string }>;
}) {
  await requirePermission("presence.review");
  const sp = await searchParams;
  const to = sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : officeYmd();
  const from = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : addDays(to, -6);
  const tab = (TABS as readonly string[]).includes(sp.tab || "") ? (sp.tab as Tab) : "people";
  const q = (sp.q || "").trim();
  const today = officeYmd();

  const [flags, days, people, tasks, stations] = await Promise.all([
    prisma.attendanceFlag.findMany({
      where: { ymd: { gte: from, lte: to }, resolvedAt: null },
      include: { user: { select: USER_SAFE_SELECT } },
      orderBy: [{ ymd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.attendanceDay.findMany({
      where: { ymd: { gte: from, lte: to } },
      include: { user: { select: USER_SAFE_SELECT } },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: "active" },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        ...USER_SAFE_SELECT,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        deletedAt: null,
        assigneeId: { not: null },
        status: { in: ["todo", "wip", "revise", "blocked", "done", "approved"] },
      },
      select: {
        id: true,
        assigneeId: true,
        stage: true,
        status: true,
        title: true,
        dueAt: true,
        updatedAt: true,
        shot: { select: { code: true } },
        scene: { select: { code: true, title: true } },
        asset: { select: { name: true } },
        episode: { select: { code: true } },
        job: { select: { title: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 2000,
    }),
    prisma.officeStation.findMany({ select: { userId: true, lastSeenAt: true } }),
  ]);

  const lanOnline = new Set(
    stations.filter((s) => stationOnline(s.lastSeenAt)).map((s) => s.userId),
  );

  const byUser = new Map<string, Map<string, (typeof days)[0]>>();
  for (const row of days) {
    if (!byUser.has(row.userId)) byUser.set(row.userId, new Map());
    byUser.get(row.userId)!.set(row.ymd, row);
  }

  const openBy = new Map<string, TaskRow[]>();
  const doneBy = new Map<string, TaskRow[]>();
  const todoBy = new Map<string, number>();
  const review: TaskRow[] = [];
  const late: TaskRow[] = [];
  const startToday = new Date(`${today}T00:00:00+06:00`);
  const rows = tasks as TaskRow[];

  for (const t of rows) {
    const uid = t.assigneeId!;
    if (OPEN.has(t.status)) {
      const list = openBy.get(uid) || [];
      list.push(t);
      openBy.set(uid, list);
    }
    if (DONE.has(t.status)) {
      const list = doneBy.get(uid) || [];
      if (list.length < 4) list.push(t);
      doneBy.set(uid, list);
    }
    if (t.status === "todo") todoBy.set(uid, (todoBy.get(uid) || 0) + 1);
    if (t.status === "done") review.push(t);
    if (t.dueAt && t.dueAt < startToday && t.status !== "approved" && t.status !== "na") late.push(t);
  }

  for (const list of openBy.values()) {
    list.sort((a, b) => OPEN_ORDER.indexOf(a.status) - OPEN_ORDER.indexOf(b.status));
  }

  const byId = new Map(people.map((p) => [p.id, p]));
  const peopleHit = people.filter((p) =>
    hit(q, [
      fullName(p),
      p.login,
      p.position?.name,
      p.department?.name,
      ...(openBy.get(p.id) || []).map(labelOf),
      ...(doneBy.get(p.id) || []).map(labelOf),
    ]),
  );
  const reviewHit = review.filter((t) => {
    const person = t.assigneeId ? byId.get(t.assigneeId) : null;
    return hit(q, [person ? fullName(person) : "", STAGE_LABEL[t.stage], labelOf(t)]);
  });
  const lateHit = late.filter((t) => {
    const person = t.assigneeId ? byId.get(t.assigneeId) : null;
    return hit(q, [person ? fullName(person) : "", STAGE_LABEL[t.stage], labelOf(t)]);
  });
  const flagsHit = flags.filter((f) => hit(q, [fullName(f.user), flagLabel(f.kind), f.detail, f.ymd]));
  const timeHit = people.filter((p) => hit(q, [fullName(p), p.login, p.position?.name, p.department?.name]));

  const ymds: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) ymds.push(d);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "people", label: "Сотрудники", count: people.length },
    { id: "review", label: "На проверке", count: review.length },
    { id: "late", label: "Просрочки", count: late.length },
    { id: "flags", label: "Отклонения", count: flags.length },
    { id: "time", label: "Табель", count: people.length },
  ];

  const placeholders: Record<Tab, string> = {
    people: "Фамилия, должность, задача",
    review: "Сотрудник или задача",
    late: "Сотрудник или задача",
    flags: "Фамилия или вид отклонения",
    time: "Фамилия",
  };

  const showWeek = tab === "flags" || tab === "time";

  return (
    <div>
      <PageHeader
        title="Контроль"
        subtitle="Отдельные разделы: кто что делает, проверки, просрочки, табель."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button href={`/api/duty/pdf?kind=journal&week=${from}`} variant="secondary">
              Журнал PDF
            </Button>
            {showWeek ? (
              <>
                <Button href={hrefFor({ tab, from: addDays(from, -7), to: addDays(to, -7), q })} variant="secondary">
                  ← неделя
                </Button>
                <Button href={hrefFor({ tab, from: addDays(from, 7), to: addDays(to, 7), q })} variant="secondary">
                  неделя →
                </Button>
              </>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link key={t.id} href={hrefFor({ tab: t.id, from, to, q })} className={tabCls(tab === t.id)}>
            {t.label}
            <span className={`ml-2 text-xs ${tab === t.id ? "text-white/80" : "text-muted"}`}>{t.count}</span>
          </Link>
        ))}
      </div>

      <ControlSearch query={q} tab={tab} from={from} to={to} placeholder={placeholders[tab]} />

      {tab === "people" ? (
        peopleHit.length === 0 ? (
          <p className="text-sm text-muted">{q ? `Никого не нашлось по запросу «${q}».` : "Никого."}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {peopleHit.map((p) => {
              const now = (openBy.get(p.id) || []).slice(0, 4);
              const extraOpen = (openBy.get(p.id) || []).length - now.length;
              const done = doneBy.get(p.id) || [];
              const queued = todoBy.get(p.id) || 0;
              const att = byUser.get(p.id)?.get(today);
              return (
                <Card key={p.id} className="flex flex-col">
                  <div className="flex items-start gap-3">
                    <Avatar photoFileId={p.photoFileId} lastName={p.lastName} firstName={p.firstName} size={48} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/employees/${p.id}`} className="font-serif text-xl text-navy hover:text-gold">
                        {fullName(p)}
                      </Link>
                      <p className="text-sm text-muted">
                        {p.position?.name || "без должности"}
                        {p.department ? ` · ${p.department.name}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {att?.inAt
                          ? `сегодня ${fmtTimeOmsk(att.inAt)}${att.outAt ? `–${fmtTimeOmsk(att.outAt)}` : ""}`
                          : "сегодня не отмечен"}
                        {lanOnline.has(p.id) ? " · ПК в сети" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Сейчас</p>
                    {now.length === 0 ? (
                      <p className="mt-1 text-sm text-muted">
                        нет открытых задач
                        {queued ? ` · в очереди ${queued}` : ""}
                      </p>
                    ) : (
                      <ul className="mt-1 space-y-1.5">
                        {now.map((t) => (
                          <li key={t.id}>
                            <Link href={`/prod/tasks/${t.id}`} className="block rounded-lg hover:bg-paper">
                              <span className="mr-1 text-xs text-muted">{STAGE_LABEL[t.stage] || t.stage}</span>
                              <span className="text-sm font-medium text-navy">{labelOf(t)}</span>
                              <span className="ml-1">
                                <Pill tone={STATUS_PILL[t.status] || "draft"}>{STATUS_LABEL[t.status] || t.status}</Pill>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {extraOpen > 0 ? <p className="mt-1 text-xs text-muted">ещё {extraOpen}</p> : null}
                  </div>
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">Сделано</p>
                    {done.length === 0 ? (
                      <p className="mt-1 text-sm text-muted">пока пусто</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {done.map((t) => (
                          <li key={t.id} className="text-sm">
                            <Link href={`/prod/tasks/${t.id}`} className="hover:text-gold">
                              {labelOf(t)}
                            </Link>
                            <span className="ml-1 text-xs text-muted">
                              {STATUS_LABEL[t.status]} · {fmtDate(t.updatedAt)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "review" ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">На проверке</h2>
          <p className="mt-1 text-sm text-muted">Сдали, руководитель ещё не утвердил.</p>
          {reviewHit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{q ? `Ничего не нашлось по запросу «${q}».` : "Очереди нет."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {reviewHit.slice(0, 80).map((t) => {
                const person = t.assigneeId ? byId.get(t.assigneeId) : null;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/prod/tasks/${t.id}`} className="font-medium text-navy hover:text-gold">
                      {STAGE_LABEL[t.stage] || t.stage} · {labelOf(t)}
                    </Link>
                    <span className="text-sm text-muted">{person ? fullName(person) : "—"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "late" ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">Просрочки</h2>
          <p className="mt-1 text-sm text-muted">Срок прошёл, задача ещё не утверждена.</p>
          {lateHit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{q ? `Ничего не нашлось по запросу «${q}».` : "Просрочек нет."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {lateHit.slice(0, 80).map((t) => {
                const person = t.assigneeId ? byId.get(t.assigneeId) : null;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/prod/tasks/${t.id}`} className="font-medium text-navy hover:text-gold">
                      {STAGE_LABEL[t.stage] || t.stage} · {labelOf(t)}
                    </Link>
                    <span className="text-sm text-muted">
                      {person ? fullName(person) : "—"} · до {fmtDate(t.dueAt)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "flags" ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">
            Отклонения {from} — {to}
          </h2>
          {flagsHit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{q ? `Ничего не нашлось по запросу «${q}».` : "Пока чисто."}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {flagsHit.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-semibold">{fullName(f.user)}</span>
                    <span className="ml-2 text-sm text-muted">
                      {f.ymd} · {flagLabel(f.kind)}
                      {f.minutes ? ` · ${f.minutes} мин` : ""}
                      {f.detail ? ` · ${f.detail}` : ""}
                    </span>
                  </div>
                  <FlagOk id={f.id} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "time" ? (
        <Card className="overflow-x-auto">
          <h2 className="font-serif text-xl text-navy">Табель</h2>
          {timeHit.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{q ? `Никого не нашлось по запросу «${q}».` : "Никого."}</p>
          ) : (
            <table className="mt-3 w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 pr-3 font-medium">Сотрудник</th>
                  {ymds.map((d) => (
                    <th key={d} className="px-1 py-1 font-medium">
                      {d.slice(8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeHit.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="py-2 pr-3 font-semibold text-navy">{fullName(p)}</td>
                    {ymds.map((d) => {
                      const row = byUser.get(p.id)?.get(d);
                      const rest = !officeClock(new Date(`${d}T12:00:00+06:00`)).weekdayWork;
                      return (
                        <td key={d} className={`px-1 py-2 ${rest ? "bg-paper-2/60 text-muted" : ""}`}>
                          {row?.inAt ? (
                            <span>
                              {fmtTimeOmsk(row.inAt)}
                              {row.outAt ? `–${fmtTimeOmsk(row.outAt)}` : "–"}
                            </span>
                          ) : rest ? (
                            "—"
                          ) : (
                            <Pill tone="wait">нет</Pill>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ) : null}
    </div>
  );
}

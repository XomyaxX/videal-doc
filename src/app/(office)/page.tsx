import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { fmtBirth, fmtDate } from "@/lib/dates";
import { ADVANCE_STATUS } from "@/lib/status";
import { upcomingBirthdays } from "@/lib/birthdays";
import { fullName } from "@/lib/names";
import { dueLabel, issuedYmd, reportDueYmd } from "@/lib/report-period";
import { ReportFundsPicker } from "@/components/ReportFundsPicker";
import { chatUnreadTotal } from "@/lib/chat-server";
import { USER_SAFE_SELECT } from "@/lib/user-public";
import { dutyForWeek } from "@/lib/duty";

export default async function HomePage() {
  const user = await requireUser();
  const chatUnread = await chatUnreadTotal(user.id);

  const toAck = await prisma.documentRecipient.findMany({
    where: {
      userId: user.id,
      rejectedAt: null,
      ackedAt: null,
      document: { status: "active", deletedAt: null, requireAck: true },
    },
    include: { document: true },
    orderBy: { createdAt: "desc" },
  });

  const toSign = await prisma.documentRecipient.findMany({
    where: {
      userId: user.id,
      rejectedAt: null,
      signedAt: null,
      document: { status: "active", deletedAt: null, requireSignedReturn: true },
    },
    include: { document: true },
    orderBy: { createdAt: "desc" },
  });

  const toApprove = await prisma.documentRecipient.findMany({
    where: {
      userId: user.id,
      rejectedAt: null,
      approvedAt: null,
      isApprover: true,
      document: { status: "active", deletedAt: null, requireApproval: true },
    },
    include: { document: true },
    orderBy: { createdAt: "desc" },
  });

  const drafts = can(user, "finance.create")
    ? await prisma.advanceReport.findMany({
        where: { userId: user.id, status: { in: ["draft", "rework"] }, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        take: 8,
      })
    : [];

  const waitingApprove = can(user, "finance.approve")
    ? await prisma.advanceReport.findMany({
        where: { status: { in: ["review", "approve"] }, deletedAt: null },
        include: { user: { select: USER_SAFE_SELECT } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      })
    : [];

  const fundsReview = await prisma.fundRequest.findMany({
    where: { deletedAt: null, status: "review", managerId: user.id },
    include: { author: { select: USER_SAFE_SELECT } },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const toReport = await prisma.fundRequest.findMany({
    where: { authorId: user.id, status: "paid", advanceReportId: null, deletedAt: null },
    orderBy: { paidAt: "asc" },
  });

  const fundsPay = ["accountant", "admin", "superadmin"].includes(user.roleCode)
    ? await prisma.fundRequest.findMany({
        where: { deletedAt: null, status: "to_pay" },
        include: { author: { select: USER_SAFE_SELECT } },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];

  const weekEnd = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  const meetings = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      status: { notIn: ["cancelled", "done"] },
      startsAt: { lte: weekEnd },
      endsAt: { gte: new Date() },
      OR: [{ authorId: user.id }, { participants: { some: { userId: user.id } } }],
    },
    orderBy: { startsAt: "asc" },
    take: 8,
  });
  const events = await prisma.calendarEvent.findMany({
    where: {
      deletedAt: null,
      startsAt: { lte: weekEnd },
      endsAt: { gte: new Date() },
      OR: [{ authorId: user.id }, { participants: { some: { userId: user.id } } }],
    },
    orderBy: { startsAt: "asc" },
    take: 8,
  });

  const myProd = await prisma.task.findMany({
    where: {
      deletedAt: null,
      status: { in: ["todo", "wip", "revise", "blocked", "done"] },
      OR: [{ assigneeId: user.id }, { helperId: user.id }],
    },
    include: { shot: true, scene: true, asset: true },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take: 8,
  });

  const notes = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 24,
  });
  const seenNote = new Set<string>();
  const uniqueNotes = notes.filter((n) => {
    const key = `${n.title}|${n.link || ""}`;
    if (seenNote.has(key)) return false;
    seenNote.add(key);
    return true;
  }).slice(0, 5);

  const withBirth = await prisma.user.findMany({
    where: { deletedAt: null, status: "active", birthDate: { not: null } },
    include: { department: true },
  });
  const birthdays = upcomingBirthdays(withBirth, 21);
  const duty = await dutyForWeek();

  const now = [
    toAck.length
      ? {
          title: "Ознакомиться с бумагой",
          count: toAck.length,
          href: toAck.length === 1 ? `/documents/${toAck[0].documentId}` : "/documents?need=ack",
          hint: toAck.length === 1 ? toAck[0].document.title : "ждут вас",
        }
      : null,
    toSign.length
      ? {
          title: "Подписать и вернуть",
          count: toSign.length,
          href: toSign.length === 1 ? `/documents/${toSign[0].documentId}` : "/documents?need=sign",
          hint: toSign.length === 1 ? toSign[0].document.title : "распечатать, подписать, загрузить скан",
        }
      : null,
    toApprove.length
      ? {
          title: "Согласовать",
          count: toApprove.length,
          href: toApprove.length === 1 ? `/documents/${toApprove[0].documentId}` : "/documents?need=approve",
          hint: toApprove.length === 1 ? toApprove[0].document.title : "ждут вашу визу",
        }
      : null,
    can(user, "prod.view") && myProd.length
      ? {
          title: "Производство",
          count: myProd.length,
          href: myProd.length === 1 ? `/prod/tasks/${myProd[0].id}` : "/prod",
          hint: myProd.length === 1 ? "открыть задачу" : "ваши задачи",
        }
      : null,
    toReport.length
      ? {
          title: "Отчитаться по деньгам",
          count: toReport.length,
          href: "/advances/new",
          hint: "собрать авансовый по выплатам",
        }
      : null,
    chatUnread > 0
      ? { title: "Чаты", count: chatUnread, href: "/chat", hint: "есть непрочитанные" }
      : null,
  ].filter(Boolean) as { title: string; count: number; href: string; hint: string }[];

  const latestDraft = drafts[0] || null;

  return (
    <div>
      <PageHeader
        title={`Здравствуйте, ${user.firstName}`}
        subtitle="То, что нужно сделать прямо сейчас"
        actions={
          <Button href="/archive" variant="secondary">
            Личный архив
          </Button>
        }
      />

      <Card>
        <h2 className="font-serif text-xl text-navy">Сделать сейчас</h2>
        {now.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-muted">Пока ничего</p>
            <Button href="/chat" variant="secondary" className="mt-3">
              Открыть чаты
            </Button>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {now.map((item) => (
              <li key={item.href + item.title}>
                <Link href={item.href} className="flex items-center justify-between gap-3 py-3 hover:text-gold">
                  <span>
                    <span className="font-semibold">{item.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{item.hint}</span>
                  </span>
                  <span className="font-serif text-2xl text-navy">{item.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {latestDraft ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Авансовые</h2>
          <Link href={`/advances/${latestDraft.id}`} className="mt-3 flex items-center justify-between gap-3 hover:text-gold">
            <span>
              <span className="font-semibold">Продолжить черновик</span>
              <span className="mt-0.5 block text-sm text-muted">
                {latestDraft.number} · {ADVANCE_STATUS[latestDraft.status]?.label || latestDraft.status}
              </span>
            </span>
            <span className="text-sm text-gold">открыть</span>
          </Link>
          {drafts.length > 1 ? (
            <Link href="/advances?status=draft" className="mt-2 inline-block text-sm text-gold underline">
              все черновики ({drafts.length})
            </Link>
          ) : null}
        </Card>
      ) : null}

      {waitingApprove.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">На вашем согласовании</h2>
          <TaskList
            items={waitingApprove.map((d) => ({
              href: `/advances/${d.id}`,
              title: `${d.number} — ${d.user.lastName}`,
              meta: ADVANCE_STATUS[d.status]?.label,
            }))}
            empty=""
          />
        </Card>
      ) : null}

      {toReport.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Нужно отчитаться</h2>
          <p className="text-sm text-muted">Деньги выданы по запросу средств — соберите авансовый отчёт.</p>
          <ReportFundsPicker
            funds={toReport.map((f) => ({
              id: f.id,
              number: f.number,
              purpose: f.purpose,
              amount: f.amount,
              due: dueLabel(reportDueYmd(issuedYmd(f))),
            }))}
          />
        </Card>
      ) : null}

      {fundsReview.length > 0 || fundsPay.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Деньги на согласовании</h2>
          <TaskList
            items={[
              ...fundsReview.map((f) => ({
                href: `/funds/${f.id}`,
                title: `${f.number} · ${f.purpose}`,
                meta: "на согласовании",
              })),
              ...fundsPay.map((f) => ({
                href: `/funds/${f.id}`,
                title: `${f.number} · ${f.purpose}`,
                meta: "к выплате",
              })),
            ]}
            empty="Нет запросов на вас."
          />
        </Card>
      ) : null}

      {duty.trash?.id === user.id || duty.clean.some((p) => p.id === user.id) ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Дежурство</h2>
          <TaskList
            items={[
              ...(duty.trash?.id === user.id
                ? [{ href: "/duty", title: "Вынос мусора", meta: duty.todayLabel }]
                : []),
              ...(duty.clean.some((p) => p.id === user.id)
                ? [
                    {
                      href: "/duty",
                      title: "Уборка",
                      meta: duty.clean.map((p) => p.name).join(" · "),
                    },
                  ]
                : []),
            ]}
            empty=""
          />
        </Card>
      ) : null}

      {meetings.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Совещания</h2>
          <TaskList
            items={meetings.map((m) => ({
              href: `/meet/${m.id}`,
              title: m.title,
              meta: `${fmtDate(m.startsAt)}${m.place ? ` · ${m.place}` : ""}${m.status === "live" ? " · идёт" : ""}`,
            }))}
            empty="Нет совещаний."
          />
        </Card>
      ) : null}

      {events.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Ближайшие события</h2>
          <TaskList
            items={events.map((e) => ({
              href: `/calendar#${e.id}`,
              title: e.title,
              meta: fmtDate(e.startsAt),
            }))}
            empty="На этой неделе пусто."
          />
        </Card>
      ) : null}

      {birthdays.length > 0 ? (
        <Card className="mt-4">
          <h2 className="font-serif text-xl text-navy">Дни рождения</h2>
          <ul className="mt-3 divide-y divide-line">
            {birthdays.map((b) => (
              <li key={b.person.id} className="flex items-center justify-between gap-3 py-3">
                <Link href={`/employees/${b.person.id}`} className="hover:text-gold">
                  <span className="font-semibold">{fullName(b.person)}</span>
                  <span className="mt-0.5 block text-sm text-muted">
                    {fmtBirth(b.person.birthDate)} · исполняется {b.age}
                    {b.person.department ? ` · ${b.person.department.name}` : ""}
                  </span>
                </Link>
                <Pill tone={b.inDays === 0 ? "wait" : "draft"}>
                  {b.inDays === 0 ? "сегодня" : b.inDays === 1 ? "завтра" : `через ${b.inDays} дн.`}
                </Pill>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-serif text-xl text-navy">Уведомления</h2>
          <Link href="/notifications" className="text-sm text-gold underline">
            показать все
          </Link>
        </div>
        {uniqueNotes.length === 0 ? (
          <p className="mt-3 text-muted">Пока ничего</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {uniqueNotes.map((n) => (
              <li key={n.id} className="py-3">
                <Link href={n.link || "/notifications"} className="block hover:text-gold">
                  <span className="font-semibold">{n.title}</span>
                  {n.body ? <span className="mt-0.5 block text-sm text-muted">{n.body}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function TaskList({
  items,
  empty,
}: {
  items: { href: string; title: string; meta?: string }[];
  empty: string;
}) {
  if (items.length === 0) return empty ? <p className="mt-3 text-muted">{empty}</p> : null;
  return (
    <ul className="mt-3 divide-y divide-line">
      {items.map((i) => (
        <li key={i.href + i.title}>
          <Link href={i.href} className="flex items-center justify-between gap-3 py-3 hover:text-gold">
            <span className="font-medium">{i.title}</span>
            <span className="text-sm text-muted">{i.meta}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

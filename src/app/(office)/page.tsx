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
import { PresenceCard } from "./PresenceCard";
import { chatUnreadTotal } from "@/lib/chat-server";
import { USER_SAFE_SELECT } from "@/lib/user-public";

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
    where: { authorId: user.id, status: "paid", advanceReportId: null, deletedAt: null, purchaseRequestId: null },
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
      assigneeId: user.id,
      deletedAt: null,
      status: { in: ["todo", "wip", "revise", "blocked", "done"] },
    },
    include: { shot: true, scene: true, asset: true },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take: 8,
  });

  const notes = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  const withBirth = await prisma.user.findMany({
    where: { deletedAt: null, status: "active", birthDate: { not: null } },
    include: { department: true },
  });
  const birthdays = upcomingBirthdays(withBirth, 21);

  const myRequests = can(user, "requests.create")
    ? await prisma.purchaseRequest.findMany({
        where: can(user, "requests.aho")
          ? { status: { in: ["submitted", "pricing", "paid"] } }
          : { authorId: user.id, status: { in: ["draft", "rework", "submitted", "pricing", "review", "to_pay", "paid"] } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      })
    : [];

  const myHr = can(user, "hrdocs.create")
    ? await prisma.hrRequest.findMany({
        where: {
          OR: [
            { authorId: user.id, status: { in: ["draft", "signed", "rework", "review"] } },
            { managerId: user.id, status: "review" },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 8,
      })
    : [];

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

      <PresenceCard />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {chatUnread > 0 ? <Stat title="Чаты" count={chatUnread} href="/chat" hot="ответьте" /> : null}
        {toAck.length > 0 ? (
          <Stat title="Ознакомиться с бумагой" count={toAck.length} href="/documents?need=ack" hot="ждут вас" />
        ) : null}
        {toSign.length > 0 ? (
          <Stat title="Подписать и вернуть" count={toSign.length} href="/documents?need=sign" hot="ждут вас" />
        ) : null}
        {toApprove.length > 0 ? (
          <Stat title="Согласовать" count={toApprove.length} href="/documents?need=approve" hot="ждут вас" />
        ) : null}
        {toReport.length > 0 ? (
          <Stat title="Отчитаться по деньгам" count={toReport.length} href="/advances/new" hot="срок горит" />
        ) : null}
        {can(user, "prod.view") && myProd.length > 0 ? (
          <Stat title="Производство" count={myProd.length} href="/prod" hot="ваши задачи" />
        ) : null}
        {can(user, "requests.create") && myRequests.length > 0 ? (
          <Stat title="Запросы на закупку" count={myRequests.length} href="/requests" hot="в работе" />
        ) : null}
        {can(user, "hrdocs.create") && myHr.length > 0 ? (
          <Stat title="Заявления" count={myHr.length} href="/statements" hot="в работе" />
        ) : null}
      </div>
      {chatUnread === 0 &&
      toAck.length === 0 &&
      toSign.length === 0 &&
      toApprove.length === 0 &&
      toReport.length === 0 &&
      myProd.length === 0 &&
      myRequests.length === 0 &&
      myHr.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Сейчас ничего не горит. Чаты и разделы — в меню слева.</p>
      ) : null}

      {drafts.length > 0 || waitingApprove.length > 0 ? (
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-serif text-xl text-navy">Авансовые отчёты</h2>
          <TaskList
            items={drafts.map((d) => ({
              href: `/advances/${d.id}`,
              title: d.number,
              meta: ADVANCE_STATUS[d.status]?.label || d.status,
            }))}
            empty="Нет черновиков."
          />
          {waitingApprove.length > 0 ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="mb-2 text-sm font-semibold text-muted">На вашем согласовании</p>
              <TaskList
                items={waitingApprove.map((d) => ({
                  href: `/advances/${d.id}`,
                  title: `${d.number} — ${d.user.lastName}`,
                  meta: ADVANCE_STATUS[d.status]?.label,
                }))}
                empty=""
              />
            </div>
          ) : null}
        </Card>
      </section>
      ) : null}

      {toReport.length > 0 ? (
        <Card className="mt-6">
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

      {events.length > 0 || fundsReview.length > 0 || fundsPay.length > 0 ? (
        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card>
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
          <Card>
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
        </section>
      ) : null}

      {birthdays.length > 0 ? (
        <Card className="mt-6">
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

      <Card className="mt-6">
        <h2 className="font-serif text-xl text-navy">Последние уведомления</h2>
        {notes.length === 0 ? (
          <p className="mt-3 text-muted">Пока тихо.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {notes.map((n) => (
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

function Stat({
  title,
  count,
  href,
  hot,
}: {
  title: string;
  count: number;
  href: string;
  hot?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-2xl border bg-card p-5 shadow-[var(--shadow)] hover:border-gold ${
        count > 0 && hot ? "border-gold" : "border-line"
      }`}
    >
      <div className="text-sm text-muted">{title}</div>
      <div className="mt-1 font-serif text-4xl text-navy">{count}</div>
      {count > 0 ? <Pill tone="wait">{hot || "есть задачи"}</Pill> : <Pill tone="ok">пусто</Pill>}
    </Link>
  );
}

function TaskList({
  items,
  empty,
}: {
  items: { href: string; title: string; meta?: string }[];
  empty: string;
}) {
  if (items.length === 0) return <p className="mt-3 text-muted">{empty}</p>;
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

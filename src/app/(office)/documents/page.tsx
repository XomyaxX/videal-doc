import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { recipientDone } from "@/lib/status";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ need?: string; q?: string }>;
}) {
  const user = await requireUser();
  const { need, q } = await searchParams;
  const viewAll = can(user, "docs.view_all");

  const where = viewAll
    ? {
        deletedAt: null,
        ...(q ? { OR: [{ title: { contains: q } }, { number: { contains: q } }] } : {}),
      }
    : {
        deletedAt: null,
        recipients: { some: { userId: user.id } },
        ...(q ? { OR: [{ title: { contains: q } }, { number: { contains: q } }] } : {}),
      };

  const docs = await prisma.document.findMany({
    where,
    include: {
      author: { select: USER_SAFE_SELECT },
      recipients: { include: { user: { select: USER_SAFE_SELECT } } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const filtered = docs.filter((d) => {
    const mine = d.recipients.find((r) => r.userId === user.id);
    if (need === "ack") return Boolean(mine && d.requireAck && !mine.ackedAt && !mine.rejectedAt);
    if (need === "sign") return Boolean(mine && d.requireSignedReturn && !mine.signedAt && !mine.rejectedAt);
    if (need === "approve")
      return Boolean(mine && d.requireApproval && mine.isApprover && !mine.approvedAt && !mine.rejectedAt);
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Документы"
        subtitle="Бумаги, которые вам прислали: ознакомиться, подписать, согласовать."
        actions={
          <span className="flex flex-wrap gap-2">
            <Button href="/archive" variant="secondary">
              Личный архив
            </Button>
            {can(user, "docs.send") ? <Button href="/documents/send">Разослать</Button> : null}
          </span>
        }
      />
      <form className="mb-4">
        <input
          name="q"
          defaultValue={q}
          placeholder="Поиск по названию или номеру"
          className="w-full max-w-md rounded-xl border border-line bg-white px-3 py-2.5"
        />
      </form>
      {filtered.length === 0 ? (
        <Empty title="Документов нет" text="Когда вам пришлют бумагу — она появится здесь. Свои копии — в личном архиве." />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const mine = d.recipients.find((r) => r.userId === user.id);
            const doneCount = d.recipients.filter((r) =>
              recipientDone({
                ackedAt: r.ackedAt,
                signedAt: r.signedAt,
                rejectedAt: r.rejectedAt,
                approvedAt: r.approvedAt,
                isApprover: r.isApprover,
                requireAck: d.requireAck,
                requireSignedReturn: d.requireSignedReturn,
                requireApproval: d.requireApproval,
              }) === "done",
            ).length;
            let tone = "wait";
            let label = "Ждёт вас";
            if (mine) {
              const st = recipientDone({
                ackedAt: mine.ackedAt,
                signedAt: mine.signedAt,
                rejectedAt: mine.rejectedAt,
                approvedAt: mine.approvedAt,
                isApprover: mine.isApprover,
                requireAck: d.requireAck,
                requireSignedReturn: d.requireSignedReturn,
                requireApproval: d.requireApproval,
              });
              if (st === "done") {
                tone = "ok";
                label = "Готово";
              } else if (st === "rejected") {
                tone = "bad";
                label = "Отказ";
              }
            } else {
              label = `${doneCount} из ${d.recipients.length}`;
              tone = doneCount === d.recipients.length ? "ok" : "wait";
            }
            return (
              <Link key={d.id} href={`/documents/${d.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted">
                        {d.number} · {fmtDate(d.createdAt)} · {d.author.lastName}
                      </div>
                      <div className="font-serif text-xl text-navy">{d.title}</div>
                      <div className="mt-1 text-sm text-muted">
                        {[
                          d.requireAck ? "ознакомиться" : "",
                          d.requireSignedReturn ? "вернуть подписанным" : "",
                          d.requireApproval ? "согласовать" : "",
                          d.dueAt ? `до ${fmtDate(d.dueAt)}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                    <Pill tone={tone}>{label}</Pill>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

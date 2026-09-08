import Link from "next/link";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { REQUEST_STATUS, categoryLabel } from "@/lib/requests";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function RequestsPage() {
  const user = await requirePermission("requests.create");
  const aho = can(user, "requests.aho");
  const rows = await prisma.purchaseRequest.findMany({
    where: aho ? {} : { authorId: user.id },
    include: { author: { select: USER_SAFE_SELECT }, items: true, fundRequest: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <div>
      <PageHeader
        title={aho ? "Запросы АХО" : "Запросы"}
        subtitle={
          aho
            ? "Сотрудники просят купить. Вы ставите сумму и дату, согласовываете запрос средств, закупаете."
            : "Попросить купить: техника, ПО, подписки. Сумму ставит АХО."
        }
        actions={<Button href="/requests/new">Новый запрос</Button>}
      />
      {rows.length === 0 ? (
        <Empty title="Пока пусто" text={aho ? "Как только кто-то отправит запрос — он будет здесь." : "Составьте запрос со ссылками и количеством."} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const st = REQUEST_STATUS[r.status] || REQUEST_STATUS.draft;
            return (
              <Link key={r.id} href={`/requests/${r.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted">
                        {r.number} · {categoryLabel(r.category)} · {fmtDate(r.createdAt)}
                        {aho ? ` · ${fullName(r.author)}` : ""}
                      </div>
                      <div className="font-serif text-xl text-navy">{r.title}</div>
                      <div className="text-sm text-muted">
                        {r.items.length} поз.
                        {r.fundRequest ? ` · ${r.fundRequest.number}` : ""}
                      </div>
                    </div>
                    <Pill tone={st.tone}>{st.label}</Pill>
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

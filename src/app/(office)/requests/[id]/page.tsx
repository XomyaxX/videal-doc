import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { REQUEST_STATUS, categoryLabel } from "@/lib/requests";
import { fmtDate, officeYmd } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { formatMoney, kopecksToRub } from "@/lib/money";
import { isFundApprover } from "@/lib/leaders";
import { AhoPanel } from "./AhoPanel";
import { EmployeeActions } from "./EmployeeActions";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("requests.create");
  const { id } = await params;
  const aho = can(user, "requests.aho");
  const row = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: {
      author: { select: USER_SAFE_SELECT },
      ahoUser: { select: USER_SAFE_SELECT },
      items: { orderBy: { sortOrder: "asc" } },
      fundRequest: true,
    },
  });
  if (!row) notFound();
  if (!aho && row.authorId !== user.id) notFound();
  const st = REQUEST_STATUS[row.status] || REQUEST_STATUS.draft;
  const files = row.items.filter((i) => i.fileId);
  const stored = files.length
    ? await prisma.storedFile.findMany({ where: { id: { in: files.map((f) => f.fileId) } } })
    : [];
  const byId = Object.fromEntries(stored.map((f) => [f.id, f]));
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    include: { position: true, role: true, department: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  const managers = people.filter((p) => isFundApprover(p));
  const ahoStaff = people.filter(
    (p) => p.role.code === "aho" || p.department?.name === "Административно-хозяйственный отдел",
  );
  const me = people.find((p) => p.id === user.id);
  if (aho && me && !ahoStaff.some((p) => p.id === me.id)) ahoStaff.unshift(me);

  return (
    <div>
      <Link href="/requests" className="mb-2 inline-block text-sm text-muted hover:text-gold">
        ← Запросы
      </Link>
      <PageHeader
        title={row.title}
        subtitle={`${row.number} · ${categoryLabel(row.category)} · ${fullName(row.author)}`}
        actions={<Pill tone={st.tone}>{st.label}</Pill>}
      />
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          {row.reason ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">Зачем</h2>
              <p className="mt-2 whitespace-pre-wrap">{row.reason}</p>
            </Card>
          ) : null}
          <Card>
            <h2 className="font-serif text-xl text-navy">Позиции</h2>
            <ul className="mt-3 divide-y divide-line">
              {row.items.map((it) => (
                <li key={it.id} className="py-3">
                  <div className="font-semibold">
                    {it.name}{" "}
                    <span className="text-muted">
                      × {it.qty} {it.unit}
                    </span>
                  </div>
                  {it.url ? (
                    <a className="break-all text-sm text-gold underline" href={it.url} target="_blank" rel="noreferrer">
                      {it.url}
                    </a>
                  ) : (
                    <div className="text-sm text-muted">без ссылки</div>
                  )}
                  {it.note ? <div className="text-sm text-muted">{it.note}</div> : null}
                  {it.fileId ? (
                    <a className="text-sm text-gold underline" href={`/api/files/${it.fileId}`}>
                      {byId[it.fileId]?.originalName || "скрин"}
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          {row.fundRequest ? (
            <Card>
              <h2 className="font-serif text-xl text-navy">Служебная записка</h2>
              <p className="text-sm text-muted">{row.fundRequest.number}</p>
              <p className="mt-2 font-serif text-3xl text-navy">
                {row.fundRequest.amount > 0 ? formatMoney(row.fundRequest.amount) : "сумму ставит АХО"}
              </p>
              {row.fundRequest.neededAt ? (
                <p className="text-sm text-muted">нужно к {fmtDate(row.fundRequest.neededAt)}</p>
              ) : null}
              <Link href={`/funds/${row.fundRequest.id}`} className="mt-2 inline-block text-sm text-gold">
                открыть запрос средств
              </Link>
            </Card>
          ) : null}
          {aho ? (
            <Card>
              <h2 className="mb-3 font-serif text-xl text-navy">Действия АХО</h2>
              <AhoPanel
                id={row.id}
                status={row.status}
                fundStatus={row.fundRequest?.status || null}
                fundAmount={row.fundRequest ? kopecksToRub(row.fundRequest.amount) : ""}
                fundDetails={row.fundRequest?.details || ""}
                fundPayee={row.fundRequest?.payee || ""}
                fundNeededAt={row.fundRequest?.neededAt ? officeYmd(row.fundRequest.neededAt) : ""}
                fundManagerId={row.fundRequest?.managerId || ""}
                managers={managers.map((m) => ({ id: m.id, name: fullName(m) }))}
                ahoStaff={ahoStaff.filter(Boolean).map((p) => ({ id: p.id, name: fullName(p) }))}
                meId={user.id}
              />
            </Card>
          ) : (
            <Card>
              <EmployeeActions id={row.id} status={row.status} />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

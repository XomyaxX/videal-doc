import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, Empty, PageHeader, Pill } from "@/components/ui";
import { fmtDate } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { registryDir } from "@/lib/registry";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ dir?: string; q?: string }>;
}) {
  await requireUser();
  const { dir, q } = await searchParams;
  const direction = dir === "in" || dir === "out" ? dir : undefined;
  const query = (q || "").trim();
  const rows = await prisma.correspondence.findMany({
    where: {
      deletedAt: null,
      ...(direction ? { direction } : {}),
      ...(query
        ? {
            OR: [
              { number: { contains: query } },
              { subject: { contains: query } },
              { correspondent: { contains: query } },
            ],
          }
        : {}),
    },
    include: { registeredBy: { select: USER_SAFE_SELECT } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div>
      <PageHeader
        title="Журнал корреспонденции"
        subtitle="Входящие и исходящие письма снаружи студии. Внутренние приказы — в «Документах»."
        actions={<Button href="/registry/new">Записать письмо</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button href="/registry" variant={!direction ? "primary" : "secondary"}>
          Все
        </Button>
        <Button href="/registry?dir=in" variant={direction === "in" ? "primary" : "secondary"}>
          Входящие
        </Button>
        <Button href="/registry?dir=out" variant={direction === "out" ? "primary" : "secondary"}>
          Исходящие
        </Button>
      </div>
      <form className="mb-4">
        {direction ? <input type="hidden" name="dir" value={direction} /> : null}
        <input
          name="q"
          defaultValue={query}
          placeholder="Номер, тема, контрагент"
          className="w-full max-w-md rounded-xl border border-line bg-white px-3 py-2.5"
        />
      </form>
      {rows.length === 0 ? (
        <Empty title="Пока пусто" text="Когда придёт или уйдёт письмо — запишите его сюда, чтобы не потерять номер." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const d = registryDir(r.direction);
            return (
              <Link key={r.id} href={`/registry/${r.id}`}>
                <Card className="hover:border-gold">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-muted">
                        {r.number} · {fmtDate(r.datedAt)} · {fullName(r.registeredBy)}
                      </div>
                      <div className="font-serif text-xl text-navy">{r.subject}</div>
                      <p className="text-sm text-muted">{r.correspondent}</p>
                    </div>
                    <Pill tone={d.tone}>{d.label}</Pill>
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

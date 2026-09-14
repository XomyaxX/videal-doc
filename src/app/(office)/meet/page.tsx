import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader, Pill } from "@/components/ui";
import { canCreateMeet, serializeMeet } from "@/lib/meet";
import { fmtDateTime } from "@/lib/dates";

export default async function MeetListPage() {
  const user = await requireUser();
  const rows = await prisma.meeting.findMany({
    where: {
      deletedAt: null,
      OR: [{ authorId: user.id }, { participants: { some: { userId: user.id } } }],
    },
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
      participants: {
        include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } } },
      },
      files: true,
    },
    orderBy: { startsAt: "asc" },
    take: 80,
  });
  const fileIds = [...new Set(rows.flatMap((r) => r.files.map((f) => f.fileId)))];
  const recs = fileIds.length
    ? await prisma.storedFile.findMany({
        where: { id: { in: fileIds } },
        select: { id: true, originalName: true, mimeType: true, size: true },
      })
    : [];
  const list = rows.map((m) => serializeMeet(m, user.id, recs));
  const now = Date.now();
  const today = list.filter((m) => m.status !== "cancelled" && m.status !== "done" && new Date(m.endsAt).getTime() >= now && new Date(m.startsAt).getTime() < now + 24 * 60 * 60 * 1000);
  const later = list.filter((m) => m.status !== "cancelled" && m.status !== "done" && new Date(m.startsAt).getTime() >= now + 24 * 60 * 60 * 1000);
  const past = list.filter((m) => m.status === "done" || m.status === "cancelled" || new Date(m.endsAt).getTime() < now).reverse();
  const canCreate = canCreateMeet(user);

  function Block({ title, items }: { title: string; items: typeof list }) {
    if (!items.length) return null;
    return (
      <Card className="mt-4">
        <h2 className="font-serif text-xl text-navy">{title}</h2>
        <ul className="mt-3 divide-y divide-line">
          {items.map((m) => (
            <li key={m.id} className="py-3">
              <Link href={`/meet/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 hover:text-gold">
                <span>
                  <span className="block font-semibold text-navy">{m.title}</span>
                  <span className="block text-sm text-muted">
                    {fmtDateTime(m.startsAt)} · {m.place || "место не указано"} · {m.participants.length} чел.
                  </span>
                </span>
                <Pill tone={m.status === "live" ? "wait" : "navy"}>
                  {m.status === "live" ? "Идёт" : m.status === "cancelled" ? "Отмена" : m.canJoin ? "Войти" : "Открыть"}
                </Pill>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title="Совещания"
        subtitle="Созыв: тема, кто должен быть, место и материалы. Созвон — в офисной сети."
        actions={canCreate ? <Button href="/meet/new">Созвать</Button> : null}
      />
      {!list.length ? (
        <Card>
          <p className="text-muted">{canCreate ? "Пока пусто. Созовите первое совещание." : "Вас пока никуда не пригласили."}</p>
        </Card>
      ) : null}
      <Block title="Сегодня и ближайшие" items={today} />
      <Block title="Дальше" items={later} />
      <Block title="Прошедшие" items={past} />
    </div>
  );
}

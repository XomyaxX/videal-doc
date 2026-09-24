import { requireUser } from "@/lib/auth";
import { Button, Card, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/Avatar";
import { DUTY, dutyForWeek, upcomingCleanDays, upcomingWorkdays, weekdayIso, type DutyPerson } from "@/lib/duty";
import { officeYmd } from "@/lib/dates";

function DutyNow({
  title,
  people,
  empty,
  pdf,
  period,
  meId,
}: {
  title: string;
  people: DutyPerson[];
  empty: string;
  pdf: string;
  period: string;
  meId: string;
}) {
  const mine = people.some((p) => p.id === meId);
  return (
    <Card className={mine ? "ring-2 ring-gold" : ""}>
      <h2 className="font-serif text-xl text-navy">{title}</h2>
      <p className="text-sm text-muted">{period}</p>
      {people.length ? (
        <ul className="mt-3 space-y-3">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3">
              <Avatar photoFileId={person.photoFileId} lastName={person.lastName} firstName={person.firstName} size={48} />
              <div>
                <p className="font-semibold text-navy">{person.name}</p>
                {person.id === meId ? <p className="text-sm text-gold">это вы</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{empty}</p>
      )}
      <div className="mt-4">
        <Button href={pdf} variant="secondary">
          Распечатать табличку
        </Button>
      </div>
    </Card>
  );
}

export default async function DutyPage() {
  const user = await requireUser();
  const now = officeYmd();
  const cur = await dutyForWeek(now);
  const trashDays = upcomingWorkdays(cur.men, now, 20, cur.overrides);
  const cleanDays = upcomingCleanDays(cur.women, now, 16, cur.overrides);
  const weekend = weekdayIso(now) > 5;

  return (
    <div>
      <PageHeader
        title="Графики студии"
        subtitle="Вынос мусора — мужчины, каждый рабочий день. Уборка — женщины, вторник и пятница, двое. Журнал прихода — тот же живой состав. Без руководства, АХО и кадров."
        actions={
          <Button href="/api/duty/pdf?kind=journal" variant="secondary">
            Журнал прихода/ухода
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        <DutyNow
          title="Вынос мусора"
          people={cur.trash ? [cur.trash] : []}
          empty={weekend ? "Сегодня выходной" : "Нет мужчин в ротации"}
          pdf="/api/duty/pdf?kind=trash"
          period={cur.todayLabel}
          meId={user.id}
        />
        <DutyNow
          title="Уборка"
          people={cur.clean}
          empty={
            weekend
              ? "Сегодня выходной"
              : cur.women.length
                ? "Уборка по вторникам и пятницам"
                : "Нет женщин в ротации"
          }
          pdf="/api/duty/pdf?kind=clean"
          period={`${cur.todayLabel} · вт и пт, двое`}
          meId={user.id}
        />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-navy">{DUTY.trash.title} · 20 рабочих дней</h2>
            <Button href="/api/duty/pdf?kind=trash" variant="ghost">
              PDF
            </Button>
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {trashDays.map((d) => (
                <tr key={d.ymd} className={d.ymd === cur.today ? "font-semibold text-navy" : ""}>
                  <td className="py-1.5">{d.label}</td>
                  <td>{d.person?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-serif text-xl text-navy">{DUTY.clean.title} · вт и пт</h2>
            <Button href="/api/duty/pdf?kind=clean" variant="ghost">
              PDF
            </Button>
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {cleanDays.map((d) => (
                <tr key={d.ymd} className={d.ymd === cur.today ? "font-semibold text-navy" : ""}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{d.label}</td>
                  <td>{d.people.map((p) => p.name).join(" · ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}

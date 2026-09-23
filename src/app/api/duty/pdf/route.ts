import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { DUTY, addDaysYmd, dutyRoster, fmtWeek, mondayOfYmd, officeStaff, upcomingCleanDays, upcomingWorkdays, weekdayIso } from "@/lib/duty";
import { officeYmd } from "@/lib/dates";
import { renderDutyPdf, renderJournalPdf } from "@/lib/pdf/render";

const DAY_SHORT = ["", "Пн", "Вт", "Ср", "Чт", "Пт"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const kind = req.nextUrl.searchParams.get("kind") || "trash";
  const now = officeYmd();
  if (kind === "journal") {
    const raw = req.nextUrl.searchParams.get("week") || now;
    const mon = mondayOfYmd(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : now);
    const staff = await officeStaff();
    const days = [0, 1, 2, 3, 4].map((i) => {
      const ymd = addDaysYmd(mon, i);
      const [y, m, d] = ymd.split("-");
      return { key: ymd, label: `${DAY_SHORT[weekdayIso(ymd)]} ${Number(d)}.${m}` };
    });
    const buf = await renderJournalPdf({
      weekLabel: fmtWeek(mon),
      days,
      names: staff.map((p) => p.name),
    });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="zhurnal-prihoda.pdf"`,
      },
    });
  }
  const spec = kind === "clean" ? DUTY.clean : DUTY.trash;
  const roster = await dutyRoster(spec.gender);
  const rows =
    kind === "clean"
      ? upcomingCleanDays(roster, now, 16).map((d, i) => ({
          n: i + 1,
          period: d.label,
          name: d.people.map((p) => p.name).join(" · ") || "—",
        }))
      : upcomingWorkdays(roster, now, 20).map((d, i) => ({
          n: i + 1,
          period: d.label,
          name: d.person?.name || "—",
        }));
  const buf = await renderDutyPdf({
    title: spec.title,
    periodTitle: "Дата",
    nameTitle: kind === "clean" ? "Дежурные" : "Дежурный",
    hint:
      kind === "clean"
        ? "ООО «Видиал Медиа» · женский состав, без руководства, АХО и кадров · вторник и пятница · двое · состав из карточек сотрудников"
        : "ООО «Видиал Медиа» · мужской состав, без руководства, АХО и кадров · один рабочий день — один человек · пн–пт · состав из карточек сотрудников",
    rows,
  });
  const name = kind === "clean" ? "grafik-uborka.pdf" : "grafik-musor.pdf";
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name}"`,
    },
  });
}

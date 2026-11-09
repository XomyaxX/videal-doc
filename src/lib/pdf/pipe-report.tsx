import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import path from "path";
import fs from "fs/promises";
import { prisma } from "@/lib/prisma";
import { PIPE_DEPT_LABEL, isPipeDept } from "@/lib/pipe-board";

const fontDir = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "fonts");
Font.register({
  family: "DejaVu",
  fonts: [
    { src: path.join(fontDir, "DejaVuSans.ttf"), fontWeight: "normal" },
    { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

export const PROD_REPORT_DIR = path.join(/* turbopackIgnore: true */ process.cwd(), "data", "prod-reports");

const STATUSES = ["todo", "wip", "revise", "blocked", "done", "approved", "na"] as const;

type Person = { name: string; dept: string; tasks: number; approved: number; done: number; hours: number; points: number };
export type PipeReportData = {
  id: string;
  name: string;
  dept: string;
  createdAt: string;
  completedAt: string;
  completedBy: string;
  taskCount: number;
  byStatus: Record<string, number>;
  hours: number;
  people: Person[];
  chapters: { name: string; tasks: number; people: number }[];
  generatedAt: string;
};

type U = { id: string; lastName: string; firstName: string; middleName: string; department?: { name: string } | null };
const fio = (u: U) => [u.lastName, u.firstName, u.middleName].filter(Boolean).join(" ");
const omsk = (d: Date | null | undefined, time = false) =>
  d
    ? d.toLocaleString("ru-RU", {
        timeZone: "Asia/Omsk",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...(time ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";
const num = (n: number) => (Math.round(n * 10) / 10).toString().replace(".", ",");

export async function loadPipeReportData(projectId: string): Promise<PipeReportData> {
  const userSel = { id: true, lastName: true, firstName: true, middleName: true, department: { select: { name: true } } };
  const p = await prisma.pipeProject.findUnique({
    where: { id: projectId },
    include: {
      chapters: { orderBy: { sortOrder: "asc" } },
      tasks: {
        where: { deletedAt: null },
        select: {
          id: true,
          status: true,
          estimateHours: true,
          pipeChapterId: true,
          assignee: { select: userSel },
          helper: { select: userSel },
          crew: { select: { user: { select: userSel } } },
        },
      },
    },
  });
  if (!p) throw new Error("Нет проекта");
  const taskIds = p.tasks.map((t) => t.id);
  const events = taskIds.length
    ? await prisma.productionScoreEvent.groupBy({ by: ["userId"], where: { taskId: { in: taskIds } }, _sum: { points: true } })
    : [];
  const pts = new Map(events.map((e) => [e.userId, e._sum.points || 0]));
  const completedBy = p.completedById
    ? await prisma.user.findUnique({ where: { id: p.completedById }, select: userSel })
    : null;

  const people = new Map<string, Person>();
  const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  const chapterTasks = new Map<string, { tasks: number; users: Set<string> }>();
  let hours = 0;
  for (const t of p.tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    const h = t.estimateHours || 0;
    hours += h;
    const us = new Map<string, U>();
    for (const u of [t.assignee, t.helper, ...t.crew.map((c) => c.user)]) if (u) us.set(u.id, u);
    for (const u of us.values()) {
      const row = people.get(u.id) || { name: fio(u), dept: u.department?.name || "", tasks: 0, approved: 0, done: 0, hours: 0, points: 0 };
      row.tasks++;
      if (t.status === "approved") row.approved++;
      if (t.status === "done") row.done++;
      row.hours += h;
      people.set(u.id, row);
    }
    const key = t.pipeChapterId || "";
    const ch = chapterTasks.get(key) || { tasks: 0, users: new Set<string>() };
    ch.tasks++;
    us.forEach((_, id) => ch.users.add(id));
    chapterTasks.set(key, ch);
  }
  for (const [id, row] of people) row.points = pts.get(id) || 0;
  const chapters = p.chapters.map((c) => {
    const x = chapterTasks.get(c.id);
    return { name: c.name, tasks: x?.tasks || 0, people: x?.users.size || 0 };
  });
  const loose = chapterTasks.get("");
  if (loose) chapters.push({ name: "Без этапа", tasks: loose.tasks, people: loose.users.size });

  return {
    id: p.id,
    name: p.name,
    dept: isPipeDept(p.dept) ? PIPE_DEPT_LABEL[p.dept] : p.dept,
    createdAt: omsk(p.createdAt),
    completedAt: p.completedAt ? omsk(p.completedAt) : "не завершён",
    completedBy: completedBy ? fio(completedBy) : "—",
    taskCount: p.tasks.length,
    byStatus,
    hours,
    people: [...people.values()].sort((a, b) => b.tasks - a.tasks || a.name.localeCompare(b.name, "ru")),
    chapters,
    generatedAt: omsk(new Date(), true),
  };
}

const s = StyleSheet.create({
  page: { fontFamily: "DejaVu", fontSize: 9, color: "#111", paddingTop: 32, paddingBottom: 48, paddingHorizontal: 40, lineHeight: 1.3 },
  brand: { fontSize: 8, color: "#555" },
  title: { fontSize: 15, fontWeight: "bold", marginTop: 4 },
  sub: { fontSize: 10, color: "#333", marginTop: 2 },
  dates: { fontSize: 8.5, color: "#333", marginTop: 6, marginBottom: 10 },
  kpis: { flexDirection: "row", marginBottom: 12 },
  kpi: { flex: 1, borderWidth: 0.7, borderColor: "#bbb", padding: 6, marginRight: 6 },
  kpiV: { fontSize: 13, fontWeight: "bold" },
  kpiL: { fontSize: 7.5, color: "#555" },
  h2: { fontSize: 11, fontWeight: "bold", marginTop: 8, marginBottom: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ccc", paddingVertical: 2.5 },
  th: { fontWeight: "bold", backgroundColor: "#eef1f6" },
  foot: { position: "absolute", left: 40, right: 40, bottom: 20, fontSize: 7, color: "#666", flexDirection: "row", justifyContent: "space-between" },
});

const PCOLS = [
  { k: "name", w: "30%", t: "Участник" },
  { k: "dept", w: "20%", t: "Отдел" },
  { k: "tasks", w: "9%", t: "Задач" },
  { k: "approved", w: "10%", t: "Утвержд." },
  { k: "done", w: "9%", t: "Готово" },
  { k: "hours", w: "11%", t: "Часы (оц.)" },
  { k: "points", w: "11%", t: "Баллы" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  todo: "к работе", wip: "в работе", revise: "доработка", blocked: "блок", done: "готово", approved: "утверждено", na: "н/п",
};

export function PipeReportDocument({ data }: { data: PipeReportData }) {
  const d = data;
  return (
    <Document title={`Отчёт по проекту — ${d.name}`}>
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>Видеаль Медиа · Отчёт по проекту</Text>
        <Text style={s.title}>{d.name}</Text>
        <Text style={s.sub}>{d.dept}</Text>
        <Text style={s.dates}>
          Создан: {d.createdAt} · Завершён: {d.completedAt} · Кем: {d.completedBy}
        </Text>
        <View style={s.kpis}>
          {[
            [String(d.taskCount), "задач"],
            [String(d.people.length), "участников"],
            [num(d.hours), "часов (оценка)"],
            [`${d.byStatus.approved || 0} / ${d.byStatus.done || 0}`, "утверждено / готово"],
          ].map(([v, l]) => (
            <View key={l} style={s.kpi}>
              <Text style={s.kpiV}>{v}</Text>
              <Text style={s.kpiL}>{l}</Text>
            </View>
          ))}
        </View>
        <Text style={{ fontSize: 8, color: "#444", marginBottom: 6 }}>
          Статусы: {STATUSES.map((k) => `${STATUS_LABEL[k]} ${d.byStatus[k] || 0}`).join(" · ")}
        </Text>
        <Text style={s.h2}>Участники</Text>
        <View style={[s.tr, s.th]} fixed>
          {PCOLS.map((c) => (
            <Text key={c.k} style={{ width: c.w }}>{c.t}</Text>
          ))}
        </View>
        {d.people.length === 0 ? <Text style={{ marginTop: 4 }}>Нет участников</Text> : null}
        {d.people.map((p, i) => (
          <View key={i} style={s.tr} wrap={false}>
            {PCOLS.map((c) => (
              <Text key={c.k} style={{ width: c.w }}>
                {c.k === "hours" ? num(p.hours) : String(p[c.k])}
              </Text>
            ))}
          </View>
        ))}
        <Text style={s.h2}>По главам</Text>
        {d.chapters.length === 0 ? <Text>Нет глав</Text> : null}
        {d.chapters.map((c, i) => (
          <Text key={i} style={{ marginBottom: 2 }}>
            {c.name} · {c.tasks} задач · {c.people} чел.
          </Text>
        ))}
        <View style={s.foot} fixed>
          <Text>Сформировано: {d.generatedAt} (Омск)</Text>
          <Text>id {d.id}</Text>
        </View>
      </Page>
    </Document>
  );
}

function stamp(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Omsk", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
}

/** Собирает PDF, пишет в data/prod-reports и обновляет reportPath/reportGeneratedAt. */
export async function buildPipeProjectReportPdf(projectId: string): Promise<{ path: string; buffer: Buffer }> {
  const data = await loadPipeReportData(projectId);
  const buf = Buffer.from(await renderToBuffer(createElement(PipeReportDocument, { data }) as never));
  await fs.mkdir(PROD_REPORT_DIR, { recursive: true });
  const file = path.join(PROD_REPORT_DIR, `pipe-${projectId}-${stamp()}.pdf`);
  await fs.writeFile(file, buf);
  await prisma.pipeProject.update({
    where: { id: projectId },
    data: { reportPath: file, reportGeneratedAt: new Date() },
  });
  return { path: file, buffer: buf };
}

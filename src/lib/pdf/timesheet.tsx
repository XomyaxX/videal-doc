import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";

const fontDir = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "fonts");
Font.register({
  family: "DejaVu",
  fonts: [
    { src: path.join(fontDir, "DejaVuSans.ttf"), fontWeight: "normal" },
    { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const navy = "#1B3A6B";
const line = "#8AA0C0";
const s = StyleSheet.create({
  page: { fontFamily: "DejaVu", fontSize: 7.5, color: "#111", paddingTop: 18, paddingBottom: 54, paddingHorizontal: 16 },
  title: { fontSize: 13, fontWeight: "bold", color: navy, textAlign: "center", marginBottom: 2 },
  org: { fontSize: 8, marginBottom: 2 },
  sub: { fontSize: 9, fontWeight: "bold", marginBottom: 6 },
  table: { borderWidth: 0.8, borderColor: navy },
  tr: { flexDirection: "row" },
  th: { backgroundColor: navy, color: "#fff", fontWeight: "bold", fontSize: 7, padding: 3, textAlign: "center" },
  td: { fontSize: 7.5, padding: 3, borderRightWidth: 0.4, borderRightColor: line, borderBottomWidth: 0.4, borderBottomColor: line },
  dept: { fontSize: 8, fontWeight: "bold", color: navy, backgroundColor: "#E3EAF5", padding: 3, borderBottomWidth: 0.4, borderBottomColor: line },
  alt: { backgroundColor: "#F4F7FB" },
  legend: { position: "absolute", left: 16, right: 16, bottom: 14, fontSize: 6.5, color: "#334155" },
});

export type TimesheetPdfCell = { text: string; kind: string };
export type TimesheetPdfData = {
  monthLabel: string; // ММ.ГГГГ
  scope: string;
  weeks: { label: string; days: { key: string; label: string; rest: boolean }[] }[];
  rows: { name: string; dept: string; cells: Record<string, TimesheetPdfCell>; total: string; daysFull: number }[];
  legend: string;
};

function cellStyle(kind: string) {
  if (kind === "holiday") return { color: "#B91C1C", backgroundColor: "#FDE8E8" };
  if (kind === "rest") return { color: "#94A3B8", backgroundColor: "#EEF1F5" };
  if (kind === "leave") return { color: "#7C3AED", fontWeight: "bold" as const };
  if (kind === "none") return { color: "#B91C1C" };
  if (kind === "forgot") return { color: "#B45309" };
  return {};
}

function Head({ data, extra }: { data: TimesheetPdfData; extra: string }) {
  return (
    <View>
      <Text style={s.title}>Табель прихода и ухода · месяц {data.monthLabel}</Text>
      <Text style={s.org}>Организация: ООО «Видеаль Медиа» · {data.scope}</Text>
      <Text style={s.sub}>{extra}</Text>
    </View>
  );
}

function Legend({ text }: { text: string }) {
  return (
    <Text style={s.legend} fixed render={({ pageNumber, totalPages }) => `${text}   ·   стр. ${pageNumber}/${totalPages}`} />
  );
}

export function TimesheetDocument({ data }: { data: TimesheetPdfData }) {
  const nameW = 150;
  const totalW = 70;
  const avail = 810 - nameW - totalW - 18;
  return (
    <Document>
      {data.rows.length === 0 ? (
        <Page size="A4" orientation="landscape" style={s.page}>
          <Head data={data} extra="Нет сотрудников в табеле для выбранного фильтра." />
        </Page>
      ) : null}
      {data.rows.length > 0
        ? data.weeks.map((w) => {
            const dayW = avail / 7;
            let lastDept = "";
            let n = 0;
            return (
              <Page key={w.label} size="A4" orientation="landscape" style={s.page}>
                <Head data={data} extra={`Неделя ${w.label}`} />
                <View style={s.table}>
                  <View style={s.tr} fixed>
                    <Text style={[s.th, { width: 18 }]}>№</Text>
                    <Text style={[s.th, { width: nameW }]}>ФИО</Text>
                    {w.days.map((d) => (
                      <Text key={d.key} style={[s.th, { width: dayW }, d.rest ? { backgroundColor: "#64748B" } : {}]}>
                        {d.label}
                      </Text>
                    ))}
                    <Text style={[s.th, { width: totalW }]}>Итого за месяц</Text>
                  </View>
                  {data.rows.map((r, i) => {
                    const head = r.dept !== lastDept;
                    lastDept = r.dept;
                    n += 1;
                    return (
                      <View key={`${r.name}-${i}`} wrap={false}>
                        {head ? <Text style={s.dept}>{r.dept}</Text> : null}
                        <View style={[s.tr, i % 2 ? s.alt : {}]}>
                          <Text style={[s.td, { width: 18, textAlign: "center" }]}>{n}</Text>
                          <Text style={[s.td, { width: nameW }]}>{r.name}</Text>
                          {w.days.map((d) => {
                            const c = r.cells[d.key] || { text: "", kind: "empty" };
                            return (
                              <Text key={d.key} style={[s.td, { width: dayW, textAlign: "center" }, cellStyle(c.kind)]}>
                                {c.text || " "}
                              </Text>
                            );
                          })}
                          <Text style={[s.td, { width: totalW, textAlign: "center", fontWeight: "bold" }]}>{r.total}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                <Legend text={data.legend} />
              </Page>
            );
          })
        : null}
      {data.rows.length > 0 ? (
        <Page size="A4" orientation="landscape" style={s.page}>
          <Head data={data} extra="Итого часов за месяц (только дни с приходом и уходом)" />
          <View style={s.table}>
            <View style={s.tr} fixed>
              <Text style={[s.th, { width: 24 }]}>№</Text>
              <Text style={[s.th, { width: 200 }]}>Отдел</Text>
              <Text style={[s.th, { width: 260 }]}>ФИО</Text>
              <Text style={[s.th, { width: 120 }]}>Дней с уходом</Text>
              <Text style={[s.th, { flexGrow: 1 }]}>Итого</Text>
            </View>
            {data.rows.map((r, i) => (
              <View key={`t-${i}`} style={[s.tr, i % 2 ? s.alt : {}]} wrap={false}>
                <Text style={[s.td, { width: 24, textAlign: "center" }]}>{i + 1}</Text>
                <Text style={[s.td, { width: 200 }]}>{r.dept}</Text>
                <Text style={[s.td, { width: 260 }]}>{r.name}</Text>
                <Text style={[s.td, { width: 120, textAlign: "center" }]}>{r.daysFull}</Text>
                <Text style={[s.td, { flexGrow: 1, fontWeight: "bold" }]}>Итого: {r.total}</Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 10, fontSize: 8 }}>Ответственный: _______________ / _______________</Text>
          <Legend text={data.legend} />
        </Page>
      ) : null}
    </Document>
  );
}

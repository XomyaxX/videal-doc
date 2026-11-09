import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";
import type { InventoryStatement, StatementLine } from "@/lib/inventory-statement";

const fontDir = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "fonts");
Font.register({
  family: "DejaVu",
  fonts: [
    { src: path.join(fontDir, "DejaVuSans.ttf"), fontWeight: "normal" },
    { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const ink = "#111";
const line = "#8AA0C0";
const navy = "#1B3A6B";

const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 8,
    color: ink,
    paddingTop: 22,
    paddingBottom: 32,
    paddingHorizontal: 18,
  },
  org: { fontSize: 9, textAlign: "center", color: navy },
  inn: { fontSize: 8, textAlign: "center", marginBottom: 4 },
  mark: { fontSize: 10, fontWeight: "bold", textAlign: "center", color: "#8a6a2f", marginBottom: 3 },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "center", color: navy },
  sub: { fontSize: 8, textAlign: "center", marginTop: 2, marginBottom: 6 },
  head: { borderWidth: 0.7, borderColor: ink, marginBottom: 8 },
  hr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: ink },
  hl: { width: "22%", padding: 3, fontSize: 8, borderRightWidth: 0.5, borderRightColor: ink },
  hv: { width: "78%", padding: 3, fontSize: 8 },
  totals: { fontSize: 8, marginBottom: 8 },
  person: { fontSize: 9, fontWeight: "bold", color: navy, marginTop: 6, marginBottom: 2 },
  personSum: { fontSize: 7.5, color: "#333", marginBottom: 2 },
  table: { borderWidth: 0.7, borderColor: ink, marginBottom: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 0.4, borderBottomColor: line },
  th: { fontWeight: "bold", fontSize: 7, padding: 3, textAlign: "center", backgroundColor: navy, color: "#fff" },
  td: { fontSize: 7.5, padding: 3 },
  cell: { borderRightWidth: 0.4, borderRightColor: line },
  h2: { fontSize: 10, fontWeight: "bold", marginTop: 8, marginBottom: 4, color: navy },
  miss: { fontSize: 8, marginBottom: 2 },
  sign: { marginTop: 4, fontSize: 8 },
  foot: { position: "absolute", left: 18, right: 18, bottom: 12, fontSize: 7, color: "#555", flexDirection: "row", justifyContent: "space-between" },
});

const COL = [
  { w: "5%", label: "№" },
  { w: "12%", label: "Инв. №" },
  { w: "27%", label: "Наименование" },
  { w: "9%", label: "По учёту" },
  { w: "9%", label: "По факту" },
  { w: "22%", label: "Результат" },
  { w: "16%", label: "Примечание" },
];

function factText(line: StatementLine) {
  return line.factQty == null ? "—" : String(line.factQty);
}

function TableHead() {
  return (
    <View style={s.tr} fixed>
      {COL.map((col, index) => (
        <Text key={col.label} style={[s.th, index < COL.length - 1 ? s.cell : {}, { width: col.w }]}>
          {col.label}
        </Text>
      ))}
    </View>
  );
}

export function InventoryStatementDocument({ data }: { data: InventoryStatement }) {
  const title = data.scope === "round" ? "СВОДНАЯ ИНВЕНТАРИЗАЦИОННАЯ ВЕДОМОСТЬ" : "ИНВЕНТАРИЗАЦИОННАЯ ВЕДОМОСТЬ";
  const head = [
    ["Документ", data.number],
    ["Дата начала", data.startedAt],
    ["Дата окончания", data.closedAt],
    ["Инвентаризацию проводил", data.conductor],
  ];
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.org}>{data.org || "ООО «Видеаль Медиа»"}</Text>
        <Text style={s.inn}>ИНН {data.inn || "5503283435"}</Text>
        {data.interim ? <Text style={s.mark}>ПРОМЕЖУТОЧНАЯ, ТУР НЕ ЗАКРЫТ</Text> : null}
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>форма в духе ИНВ-3 / ИНВ-19 · {data.number}</Text>
        <View style={s.head}>
          {head.map(([label, value], index) => (
            <View key={label} style={[s.hr, index === head.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={s.hl}>{label}</Text>
              <Text style={s.hv}>{value || " "}</Text>
            </View>
          ))}
        </View>
        <Text style={s.totals}>
          Итого по документу: соответствует {data.totals.match}, расхождения {data.totals.discrepancy}, передано{" "}
          {data.totals.transfer}. Позиций в расчёте: {data.totals.positions}.
        </Text>
        <View style={s.table}>
          <TableHead />
          {data.people.length ? null : (
            <View style={[s.tr, { borderBottomWidth: 0 }]}>
              <Text style={[s.td, { width: "100%" }]}>В туре пока нет обходов.</Text>
            </View>
          )}
          {data.people.map((person) => (
            <View key={person.auditNumber}>
              <View style={s.tr} wrap={false}>
                <Text style={[s.td, { width: "100%", fontWeight: "bold", backgroundColor: "#E8EEF6" }]}>
                  {person.name}
                  {person.department ? ` · ${person.department}` : ""} · {person.auditNumber}
                  {person.auditStatus === "open" ? " · обход не завершён" : ""}
                  {` · соответствует ${person.match}, расхождения ${person.missing + person.open}, передано ${person.transfer}`}
                </Text>
              </View>
              {(person.lines.length ? person.lines : [null]).map((line, index) => (
                <View key={`${person.auditNumber}-${index}`} style={s.tr} wrap={false}>
                  <Text style={[s.td, s.cell, { width: COL[0].w, textAlign: "center" }]}>{line ? index + 1 : " "}</Text>
                  <Text style={[s.td, s.cell, { width: COL[1].w }]}>{line?.invNo || " "}</Text>
                  <Text style={[s.td, s.cell, { width: COL[2].w }]}>{line?.title || "Позиций нет"}</Text>
                  <Text style={[s.td, s.cell, { width: COL[3].w, textAlign: "center" }]}>{line ? line.bookQty : " "}</Text>
                  <Text style={[s.td, s.cell, { width: COL[4].w, textAlign: "center" }]}>{line ? factText(line) : " "}</Text>
                  <Text style={[s.td, s.cell, { width: COL[5].w }]}>{line?.result || " "}</Text>
                  <Text style={[s.td, { width: COL[6].w }]}>{line?.note || " "}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
        {data.scope === "round" ? (
          <View wrap={false}>
            <Text style={s.h2}>Не проверены в этом туре</Text>
            {data.unchecked.length ? (
              data.unchecked.map((person) => (
                <Text key={`${person.name}-${person.state}`} style={s.miss}>
                  {person.name}
                  {person.department ? ` · ${person.department}` : ""} — {person.state === "open" ? "идёт, не завершён" : "не начат"}
                  {person.auditNumber ? ` (${person.auditNumber})` : ""}
                </Text>
              ))
            ) : (
              <Text style={s.miss}>Все действующие сотрудники закрыты обходом.</Text>
            )}
          </View>
        ) : null}
        <View wrap={false}>
          <Text style={s.h2}>Комиссия</Text>
          {["Председатель комиссии", "Член комиссии", "Член комиссии"].map((role, index) => (
            <Text key={`${role}-${index}`} style={s.sign}>
              {role}: должность ______________  подпись ______________  ФИО ______________
            </Text>
          ))}
        </View>
        <Text
          style={s.foot}
          fixed
          render={({ pageNumber, totalPages }) => `${data.number}${data.interim ? " · промежуточная" : ""} · стр. ${pageNumber}/${totalPages}`}
        />
      </Page>
    </Document>
  );
}

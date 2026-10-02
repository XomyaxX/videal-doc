import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";
import type { TmcMember } from "@/lib/tmc";

const fontDir = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "fonts");
Font.register({
  family: "DejaVu",
  fonts: [
    { src: path.join(fontDir, "DejaVuSans.ttf"), fontWeight: "normal" },
    { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 10,
    color: "#111",
    paddingTop: 22,
    paddingBottom: 22,
    paddingHorizontal: 22,
  },
  org: { fontSize: 9, textAlign: "center", marginBottom: 6 },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  sub: { fontSize: 9, textAlign: "center", marginBottom: 12 },
  head: { borderWidth: 0.8, borderColor: "#111", marginBottom: 12 },
  hr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#111" },
  hl: { width: "38%", padding: 5, fontSize: 9, borderRightWidth: 0.6, borderRightColor: "#111" },
  hv: { width: "62%", padding: 5, fontSize: 9, minHeight: 16 },
  h2: { fontSize: 11, fontWeight: "bold", marginBottom: 6, marginTop: 4 },
  table: { borderWidth: 0.8, borderColor: "#111", marginBottom: 14 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#111" },
  th: { fontWeight: "bold", fontSize: 8, padding: 4, textAlign: "center" },
  td: { fontSize: 9, padding: 4 },
  cell: { borderRightWidth: 0.6, borderRightColor: "#111" },
  member: { marginBottom: 10 },
  memberLine: { fontSize: 10, marginBottom: 2 },
  sign: { marginTop: 4, fontSize: 9, color: "#333" },
});

export type TmcPdfData = {
  number: string;
  date: string;
  fullName: string;
  position: string;
  workplace: string;
  lines: { title: string; invNo: string; qty: number }[];
  commission: TmcMember[];
};

export function TmcDocument({ data }: { data: TmcPdfData }) {
  const cols = [
    { w: "8%" },
    { w: "52%" },
    { w: "25%" },
    { w: "15%" },
  ];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.org}>ООО «Видиал Медиа»</Text>
        <Text style={s.title}>КАРТОЧКА УЧЁТА ТМЦ</Text>
        <Text style={s.sub}>
          {data.number}
          {data.date ? ` · ${data.date}` : ""}
        </Text>
        <View style={s.head}>
          {[
            ["Материально ответственное лицо", data.fullName],
            ["Должность", data.position],
            ["Подразделение", data.workplace],
          ].map(([k, v], i) => (
            <View key={k} style={[s.hr, i === 2 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={s.hl}>{k}</Text>
              <Text style={s.hv}>{v || " "}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>Закреплённые товарно-материальные ценности</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cell, { width: cols[0].w }]}>№</Text>
            <Text style={[s.th, s.cell, { width: cols[1].w }]}>Наименование</Text>
            <Text style={[s.th, s.cell, { width: cols[2].w }]}>Инв. №</Text>
            <Text style={[s.th, { width: cols[3].w }]}>Кол-во</Text>
          </View>
          {(data.lines.length ? data.lines : [{ title: " ", invNo: "", qty: 0 }]).map((line, i) => (
            <View key={i} style={[s.tr, i === (data.lines.length || 1) - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <Text style={[s.td, s.cell, { width: cols[0].w, textAlign: "center" }]}>{data.lines.length ? i + 1 : " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[1].w }]}>{line.title || " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[2].w, textAlign: "center" }]}>{line.invNo || " "}</Text>
              <Text style={[s.td, { width: cols[3].w, textAlign: "center" }]}>{line.qty || " "}</Text>
            </View>
          ))}
        </View>
        <Text style={s.h2}>Члены комиссии:</Text>
        {data.commission.map((m, i) => (
          <View key={i} style={s.member} wrap={false}>
            <Text style={s.memberLine}>
              {m.role} {m.name}
            </Text>
            <Text style={s.sign}>Подпись _________________</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";
import { formatClearanceDate, type ClearancePrint } from "@/lib/clearance";

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
    fontSize: 9,
    color: "#111",
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 18,
  },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 10 },
  head: { borderWidth: 0.8, borderColor: "#111", marginBottom: 10 },
  hr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#111" },
  hl: { width: "38%", padding: 5, fontSize: 9, borderRightWidth: 0.6, borderRightColor: "#111" },
  hv: { width: "62%", padding: 5, fontSize: 9, minHeight: 16 },
  table: { borderWidth: 0.8, borderColor: "#111" },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#111" },
  th: { fontWeight: "bold", fontSize: 7, padding: 4, textAlign: "center" },
  td: { fontSize: 8, padding: 4 },
  cell: { borderRightWidth: 0.6, borderRightColor: "#111" },
});

export type ClearancePdfData = ClearancePrint & { number?: string };

export function ClearanceDocument({ data }: { data: ClearancePdfData }) {
  const cols = [
    { key: "dept", w: "18%" },
    { key: "note", w: "32%" },
    { key: "role", w: "18%" },
    { key: "fio", w: "16%" },
    { key: "sign", w: "16%" },
  ];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.title}>ОБХОДНОЙ ЛИСТ</Text>
        <View style={s.head}>
          {[
            ["Ф.И.О. увольняющегося работника", data.fullName],
            ["Место работы", data.workplace],
            ["Должность", data.position],
            ["Дата увольнения:", formatClearanceDate(data.dismissedAt)],
          ].map(([k, v], i) => (
            <View key={k} style={[s.hr, i === 3 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={s.hl}>{k}</Text>
              <Text style={s.hv}>{v || " "}</Text>
            </View>
          ))}
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cell, { width: cols[0].w }]}>Подразделение, место выполнения трудовых функций</Text>
            <Text style={[s.th, s.cell, { width: cols[1].w }]}>
              Отметка о сдаче дел, об отсутствии задолженности, претензий (примечания)
            </Text>
            <Text style={[s.th, s.cell, { width: cols[2].w }]}>Должность лица, проставившего отметку</Text>
            <Text style={[s.th, s.cell, { width: cols[3].w }]}>Ф.И.О. лица, проставившего отметку</Text>
            <Text style={[s.th, { width: cols[4].w }]}>Подпись лица, проставившего отметку, и дата</Text>
          </View>
          {data.blocks.map((b, i) => (
            <View key={b.id} style={[s.tr, i === data.blocks.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <Text style={[s.td, s.cell, { width: cols[0].w, fontWeight: "bold", textAlign: "center" }]}>{b.title}</Text>
              <Text style={[s.td, s.cell, { width: cols[1].w, minHeight: b.id === "aho" ? 90 : 36 }]}>{b.note || " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[2].w, textAlign: "center" }]}>{b.signerRole || " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[3].w }]}>{b.signerName || " "}</Text>
              <Text style={[s.td, { width: cols[4].w }]}> </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

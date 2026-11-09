import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";
import type { WriteOffPrint } from "@/lib/writeoff";

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
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 28,
  },
  org: { fontSize: 11, fontWeight: "bold", textAlign: "center" },
  inn: { fontSize: 9, textAlign: "center", marginTop: 2, marginBottom: 10 },
  mark: { fontSize: 12, fontWeight: "bold", textAlign: "center", color: "#8a6a2f", marginBottom: 6 },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center" },
  sub: { fontSize: 10, textAlign: "center", marginTop: 3, marginBottom: 12 },
  head: { borderWidth: 0.8, borderColor: "#111", marginBottom: 12 },
  hr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#111" },
  hl: { width: "28%", padding: 5, fontSize: 9, borderRightWidth: 0.6, borderRightColor: "#111" },
  hv: { width: "72%", padding: 5, fontSize: 9, minHeight: 16 },
  h2: { fontSize: 11, fontWeight: "bold", marginBottom: 6, marginTop: 2 },
  body: { fontSize: 10, marginBottom: 10, lineHeight: 1.35 },
  table: { borderWidth: 0.8, borderColor: "#111", marginBottom: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.6, borderBottomColor: "#111" },
  th: { fontWeight: "bold", fontSize: 8, padding: 4, textAlign: "center" },
  td: { fontSize: 9, padding: 4 },
  cell: { borderRightWidth: 0.6, borderRightColor: "#111" },
  totals: { fontSize: 10, marginBottom: 12 },
  member: { marginBottom: 8 },
  sign: { marginTop: 2, fontSize: 9 },
  approve: { marginTop: 16, width: "46%", marginLeft: "auto" },
  approveTitle: { fontWeight: "bold", textAlign: "center", marginBottom: 8 },
});

export type WriteOffPdfData = WriteOffPrint & { draft?: boolean; cancelled?: boolean };

export function WriteOffDocument({ data }: { data: WriteOffPdfData }) {
  const cols = [
    { w: "8%" },
    { w: "16%" },
    { w: "40%" },
    { w: "12%" },
    { w: "24%" },
  ];
  const rows = data.lines.length ? data.lines : [{ title: " ", invNo: "", qty: 0, reason: "" }];
  const signers = data.commission.filter((m) => m.fio.trim() || m.position.trim());
  const head = [
    ["Основание", data.basis || "—"],
    ["Причина", data.reasonLabel || "—"],
    ["Примечание", data.note || "—"],
  ];
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Text style={s.org}>{data.org || "ООО «Видеаль Медиа»"}</Text>
        <Text style={s.inn}>ИНН {data.inn || "5503283435"}</Text>
        {data.draft ? <Text style={s.mark}>ЧЕРНОВИК</Text> : null}
        {data.cancelled ? <Text style={s.mark}>ОТМЕНЁН</Text> : null}
        <Text style={s.title}>АКТ № {data.number} на списание инвентаря</Text>
        <Text style={s.sub}>от {data.actDate || "—"}</Text>
        <View style={s.head}>
          {head.map(([k, v], i) => (
            <View key={k} style={[s.hr, i === head.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              <Text style={s.hl}>{k}</Text>
              <Text style={s.hv}>{v || " "}</Text>
            </View>
          ))}
        </View>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, s.cell, { width: cols[0].w }]}>№</Text>
            <Text style={[s.th, s.cell, { width: cols[1].w }]}>Инв. №</Text>
            <Text style={[s.th, s.cell, { width: cols[2].w }]}>Наименование</Text>
            <Text style={[s.th, s.cell, { width: cols[3].w }]}>Кол-во</Text>
            <Text style={[s.th, { width: cols[4].w }]}>Причина</Text>
          </View>
          {rows.map((line, i) => (
            <View key={i} style={[s.tr, i === rows.length - 1 ? { borderBottomWidth: 0 } : {}]} wrap={false}>
              <Text style={[s.td, s.cell, { width: cols[0].w, textAlign: "center" }]}>{data.lines.length ? i + 1 : " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[1].w, textAlign: "center" }]}>{line.invNo || " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[2].w }]}>{line.title || " "}</Text>
              <Text style={[s.td, s.cell, { width: cols[3].w, textAlign: "center" }]}>{line.qty || " "}</Text>
              <Text style={[s.td, { width: cols[4].w }]}>{line.reason || " "}</Text>
            </View>
          ))}
        </View>
        <Text style={s.totals}>
          Итого позиций: {data.totalPositions}. Итого количество: {data.totalQty}.
        </Text>
        <Text style={s.h2}>Заключение комиссии</Text>
        <Text style={s.body}>{data.conclusion || " "}</Text>
        {signers.map((m, i) => (
          <View key={i} style={s.member} wrap={false}>
            <Text>
              {i === 0 ? "Председатель комиссии" : "Член комиссии"}: {[m.position, m.fio].filter(Boolean).join(", ") || " "}
            </Text>
            <Text style={s.sign}>Подпись ______________</Text>
          </View>
        ))}
        <View style={s.approve} wrap={false}>
          <Text style={s.approveTitle}>УТВЕРЖДАЮ</Text>
          <Text>{data.directorTitle || "Руководитель"}</Text>
          <Text>{data.directorName || " "}</Text>
          <Text style={s.sign}>Подпись ______________</Text>
        </View>
      </Page>
    </Document>
  );
}

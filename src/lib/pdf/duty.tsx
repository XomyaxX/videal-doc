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
const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 10,
    color: "#111",
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 32,
  },
  title: { fontSize: 16, fontWeight: "bold", color: navy, textAlign: "center", marginBottom: 4 },
  sub: { fontSize: 9, textAlign: "center", marginBottom: 12, color: "#333" },
  table: { borderWidth: 0.8, borderColor: navy },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#8AA0C0" },
  th: { backgroundColor: navy, color: "#fff", fontWeight: "bold", fontSize: 9, padding: 6 },
  td: { fontSize: 9, padding: 6 },
  alt: { backgroundColor: "#F4F7FB" },
});

export type DutyPdfData = {
  title: string;
  hint: string;
  periodTitle?: string;
  nameTitle?: string;
  rows: { n: number; period: string; name: string }[];
};

export function DutyDocument({ data }: { data: DutyPdfData }) {
  const periodTitle = data.periodTitle || "Неделя";
  const nameTitle = data.nameTitle || "Дежурный";
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>{data.title}</Text>
        <Text style={s.sub}>{data.hint}</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, { width: 36 }]}>№</Text>
            <Text style={[s.th, { width: 180 }]}>{periodTitle}</Text>
            <Text style={[s.th, { width: 320 }]}>{nameTitle}</Text>
            <Text style={[s.th, { flexGrow: 1 }]}>Отметка / подпись</Text>
          </View>
          {data.rows.map((r, i) => (
            <View key={r.n} style={[s.tr, i % 2 === 0 ? s.alt : {}]} wrap={false}>
              <Text style={[s.td, { width: 36 }]}>{r.n}</Text>
              <Text style={[s.td, { width: 180 }]}>{r.period}</Text>
              <Text style={[s.td, { width: 320 }]}>{r.name}</Text>
              <Text style={[s.td, { flexGrow: 1 }]}> </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

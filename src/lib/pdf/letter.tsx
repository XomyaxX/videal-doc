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

const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 11,
    color: "#111",
    paddingTop: 36,
    paddingBottom: 88,
    paddingHorizontal: 48,
    lineHeight: 1.35,
  },
  foot: { position: "absolute", left: 48, right: 48, bottom: 22 },
  footLine: { fontSize: 7, color: "#333", textAlign: "center", lineHeight: 1.25 },
  head: { textAlign: "right", fontSize: 11, marginBottom: 18 },
  hint: { fontSize: 8, color: "#333" },
  title: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 16 },
  p: { marginBottom: 10, textAlign: "justify", textIndent: 22 },
  cap: { fontSize: 8, textAlign: "center", color: "#333", marginTop: 2 },
  line: { borderBottomWidth: 0.7, borderBottomColor: "#111", minHeight: 14, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "flex-end", marginTop: 28 },
});

export type LetterPdfData = {
  toTitle: string;
  orgName: string;
  letterhead: string[];
  toName: string;
  fromRole: string;
  fromName: string;
  title: string;
  paragraphs: string[];
  number: string;
  signDay: string;
  signMonth: string;
  signYear: string;
};

export function LetterDocument({ data }: { data: LetterPdfData }) {
  return (
    <Document>
      <Page size="A4" wrap={false} style={s.page}>
        <View style={s.head}>
          <Text>{data.toTitle}</Text>
          <Text>{data.orgName}</Text>
          {data.toName ? <Text>{data.toName}</Text> : null}
          <Text>от</Text>
          <Text>{data.fromRole || "________________"}</Text>
          <Text>{data.fromName}</Text>
          <Text style={s.hint}>(должность, ФИО)</Text>
        </View>
        <Text style={s.title}>{data.title}</Text>
        {data.paragraphs.map((p, i) => (
          <Text key={i} style={s.p}>
            {p}
          </Text>
        ))}
        <View style={s.row}>
          <View style={{ width: 170 }}>
            <View style={s.line} />
            <Text style={s.cap}>(подпись)</Text>
          </View>
          <View style={{ width: 160, marginLeft: 16 }}>
            <Text style={{ textAlign: "center" }}>({data.fromName})</Text>
            <Text style={s.cap}>(фамилия, инициалы)</Text>
          </View>
          <View style={{ flexGrow: 1, marginLeft: 12 }}>
            <Text>
              "{data.signDay}" {data.signMonth} {data.signYear} г.
            </Text>
          </View>
        </View>
        <Text style={{ marginTop: 20, fontSize: 9, color: "#333" }}>{data.number}</Text>
        {data.letterhead?.length ? (
          <View style={s.foot}>
            {data.letterhead.map((line, i) => (
              <Text key={i} style={s.footLine}>
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

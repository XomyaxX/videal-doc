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
    fontSize: 8,
    color: "#111",
    paddingTop: 18,
    paddingBottom: 18,
    paddingHorizontal: 16,
  },
  title: { fontSize: 14, fontWeight: "bold", color: navy, textAlign: "center", marginBottom: 2 },
  org: { fontSize: 8, marginBottom: 4 },
  week: { fontSize: 10, fontWeight: "bold", marginBottom: 2 },
  hint: { fontSize: 7, color: "#334155", marginBottom: 6 },
  table: { borderWidth: 0.8, borderColor: navy },
  tr: { flexDirection: "row" },
  th: { backgroundColor: navy, color: "#fff", fontWeight: "bold", fontSize: 7, padding: 3, textAlign: "center" },
  td: { fontSize: 8, padding: 4, borderRightWidth: 0.4, borderRightColor: "#8AA0C0", borderBottomWidth: 0.4, borderBottomColor: "#8AA0C0" },
  alt: { backgroundColor: "#F4F7FB" },
  foot: { marginTop: 8, fontSize: 8, flexDirection: "row", justifyContent: "space-between" },
});

export type JournalPdfData = {
  weekLabel: string;
  days: { key: string; label: string }[];
  names: string[];
};

export function JournalDocument({ data }: { data: JournalPdfData }) {
  const dayW = 72;
  const names = [...data.names, ""];
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Журнал учета прихода и ухода сотрудников</Text>
        <Text style={s.org}>Организация / подразделение: ООО «Видиал Медиа»</Text>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={s.week}>Неделя {data.weekLabel}</Text>
          <Text style={{ fontSize: 8 }}>один лист на всю рабочую неделю</Text>
        </View>
        <Text style={s.hint}>
          В клетке дня напишите время и поставьте подпись: утром — «Приход», вечером — «Уход». В примечании — отпуск,
          больничный, командировка, удалёнка. Состав из карточек, без руководства, АХО и кадров.
        </Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Text style={[s.th, { width: 22, paddingTop: 10 }]}>№</Text>
            <Text style={[s.th, { width: 168, paddingTop: 10 }]}>ФИО</Text>
            {data.days.map((d) => (
              <View key={d.key} style={{ width: dayW }}>
                <Text style={s.th}>{d.label}</Text>
                <View style={s.tr}>
                  <Text style={[s.th, { width: dayW / 2, borderTopWidth: 0.4, borderTopColor: "#8AA0C0" }]}>Приход</Text>
                  <Text style={[s.th, { width: dayW / 2, borderTopWidth: 0.4, borderTopColor: "#8AA0C0" }]}>Уход</Text>
                </View>
              </View>
            ))}
            <Text style={[s.th, { flexGrow: 1, paddingTop: 10 }]}>Примечание</Text>
          </View>
          {names.map((name, i) => (
            <View key={`${name}-${i}`} style={[s.tr, i % 2 === 0 ? s.alt : {}]} wrap={false}>
              <Text style={[s.td, { width: 22, textAlign: "center" }]}>{i + 1}</Text>
              <Text style={[s.td, { width: 168 }]}>{name}</Text>
              {data.days.map((d) => (
                <View key={d.key} style={{ flexDirection: "row", width: dayW }}>
                  <Text style={[s.td, { width: dayW / 2, minHeight: 16 }]}> </Text>
                  <Text style={[s.td, { width: dayW / 2, minHeight: 16 }]}> </Text>
                </View>
              ))}
              <Text style={[s.td, { flexGrow: 1 }]}> </Text>
            </View>
          ))}
        </View>
        <View style={s.foot}>
          <Text>Ответственный: _______________ / _______________</Text>
          <Text>Формат A4 · альбом · {data.weekLabel}</Text>
        </View>
      </Page>
    </Document>
  );
}

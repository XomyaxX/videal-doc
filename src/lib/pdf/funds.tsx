import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import path from "path";
import { rublesDigits } from "./money-words";

const fontDir = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "fonts");

Font.register({
  family: "DejaVu",
  fonts: [
    { src: path.join(fontDir, "DejaVuSans.ttf"), fontWeight: "normal" },
    { src: path.join(fontDir, "DejaVuSans-Bold.ttf"), fontWeight: "bold" },
  ],
});

const ink = "#111";
const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 10,
    color: ink,
    paddingTop: 28,
    paddingBottom: 78,
    paddingHorizontal: 42,
    lineHeight: 1.28,
  },
  foot: { position: "absolute", left: 42, right: 42, bottom: 16 },
  footLine: { fontSize: 6.5, color: "#333", textAlign: "center", lineHeight: 1.22 },
  head: { textAlign: "right", fontSize: 10, marginBottom: 12 },
  hint: { fontSize: 8, color: "#333" },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "center", marginBottom: 10, marginTop: 4 },
  p: { marginBottom: 6, textAlign: "justify" },
  indent: { textIndent: 20 },
  line: { borderBottomWidth: 0.7, borderBottomColor: ink, minHeight: 12, marginTop: 2, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "flex-end", marginTop: 6 },
  grow: { flexGrow: 1 },
  cap: { fontSize: 7.5, textAlign: "center", color: "#333", marginTop: 1 },
  block: { marginTop: 8 },
  small: { fontSize: 9 },
  details: { fontSize: 8.5, marginBottom: 6, textAlign: "justify" },
});

export type FundPdfData = {
  directorTitle: string;
  orgName: string;
  letterhead: string[];
  directorName: string;
  department: string;
  authorRole: string;
  authorShort: string;
  amount: number;
  purpose: string;
  details: string;
  outstanding: string;
  dueDay: string;
  dueMonth: string;
  dueYear: string;
  issueDay: string;
  issueMonth: string;
  issueYear: string;
  signDay: string;
  signMonth: string;
  signYear: string;
  managerMark: string;
  accountantShort: string;
  accountantDay: string;
  accountantMonth: string;
  accountantYear: string;
};

function clip(text: string, max: number) {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function QuoteDate({ day, month, year }: { day: string; month: string; year: string }) {
  return (
    <Text>
      "{day || "____"}" {month || "____________"} {year || "20____"} г.
    </Text>
  );
}

export function FundMemoDocument({ data }: { data: FundPdfData }) {
  const issueFilled = Boolean(data.issueDay && data.issueMonth && data.issueYear);
  return (
    <Document>
      <Page size="A4" wrap={false} style={s.page}>
        <View style={s.head}>
          <Text>{data.directorTitle}</Text>
          <Text>{data.orgName}</Text>
          {data.directorName ? <Text>{data.directorName}</Text> : null}
          <Text>от</Text>
          <Text>{data.authorRole || data.department || "________________"}</Text>
          <Text>{data.authorShort}</Text>
          <Text style={s.hint}>(должность, ФИО)</Text>
        </View>

        <Text style={s.title}>Заявление о выдаче денег под отчет</Text>

        <Text style={[s.p, s.indent]}>
          Прошу выдать мне под отчет сумму денежных средств в размере {rublesDigits(data.amount)} на {data.purpose}
          {data.purpose.trim().endsWith(".") ? "" : "."}
        </Text>
        {data.details ? <Text style={[s.details, s.indent]}>{clip(data.details, 700)}</Text> : null}

        <Text style={s.p}>Состояние расчетов с работником по выданным ему ранее под отчет суммам:</Text>
        <View style={s.line}>
          <Text>{data.outstanding || " "}</Text>
        </View>

        <Text style={[s.p, s.indent]}>
          Авансовый отчет, подтверждающий расходование полученных денежных средств, обязуюсь представить не позднее "
          {data.dueDay}" {data.dueMonth} {data.dueYear} г.
        </Text>

        <Text style={s.p}>
          Дата выдачи (перечисления) денежных средств:{" "}
          {issueFilled ? (
            <QuoteDate day={data.issueDay} month={data.issueMonth} year={data.issueYear} />
          ) : (
            <Text>"____" ____________ 20____ г.</Text>
          )}
        </Text>

        <View style={[s.row, { marginTop: 12 }]}>
          <View style={{ width: 180 }}>
            <View style={s.line} />
            <Text style={s.cap}>(подпись работника)</Text>
          </View>
          <View style={{ width: 150, marginLeft: 16 }}>
            <Text style={{ textAlign: "center" }}>({data.authorShort})</Text>
            <Text style={s.cap}>(фамилия, инициалы)</Text>
          </View>
          <View style={{ flexGrow: 1, marginLeft: 12 }}>
            <Text>
              "{data.signDay}" {data.signMonth} {data.signYear}г.
            </Text>
          </View>
        </View>

        <View style={s.block}>
          <Text style={s.small}>1. Дата выдачи (перечисления) денежных средств: "____" ____________ 20____ г.</Text>
          <View style={[s.row, { marginTop: 8 }]}>
            <View style={{ width: 180 }}>
              <View style={s.line} />
              <Text style={s.cap}>(подпись работника)</Text>
            </View>
            <View style={{ width: 150, marginLeft: 16 }}>
              <View style={s.line} />
              <Text style={s.cap}>(фамилия, инициалы)</Text>
            </View>
            <View style={{ flexGrow: 1, marginLeft: 12 }}>
              <Text>"____" ____________ 20____ г.</Text>
            </View>
          </View>
        </View>

        <View style={s.block}>
          <Text style={s.small}>2. Дата выдачи (перечисления) денежных средств: "____" ____________ 20____ г.</Text>
          <View style={[s.row, { marginTop: 8 }]}>
            <View style={{ width: 180 }}>
              <View style={s.line} />
              <Text style={s.cap}>(подпись работника)</Text>
            </View>
            <View style={{ width: 150, marginLeft: 16 }}>
              <View style={s.line} />
              <Text style={s.cap}>(фамилия, инициалы)</Text>
            </View>
            <View style={{ flexGrow: 1, marginLeft: 12 }}>
              <Text>"____" ____________ 20____ г.</Text>
            </View>
          </View>
        </View>

        <View style={[s.row, { marginTop: 12 }]}>
          <Text>Бухгалтер: </Text>
          <View style={{ width: 140 }}>
            <View style={s.line} />
            <Text style={s.cap}>(подпись бухгалтера)</Text>
          </View>
          <View style={{ width: 140, marginLeft: 10 }}>
            <Text style={{ textAlign: "center" }}>
              ({data.accountantShort || "______________"})
            </Text>
            <Text style={s.cap}>(фамилия, инициалы)</Text>
          </View>
          <View style={{ flexGrow: 1, marginLeft: 10 }}>
            {data.accountantDay ? (
              <Text>
                "{data.accountantDay}" {data.accountantMonth} {data.accountantYear} г.
              </Text>
            ) : (
              <Text>"____" ____________ 20____ г.</Text>
            )}
          </View>
        </View>

        <Text style={{ marginTop: 14, fontSize: 10 }}>
          Отметка о решении руководителя: {data.managerMark || "____________________"}
        </Text>
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

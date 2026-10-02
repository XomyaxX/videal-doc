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

const ink = "#111";
const s = StyleSheet.create({
  page: {
    fontFamily: "DejaVu",
    fontSize: 8,
    color: ink,
    paddingTop: 22,
    paddingBottom: 20,
    paddingHorizontal: 28,
  },
  appHead: { textAlign: "right", fontSize: 9, marginBottom: 10 },
  title: { fontSize: 12, fontWeight: "bold", textAlign: "center" },
  titleSub: { fontSize: 10, fontWeight: "bold", textAlign: "center", marginBottom: 8 },
  roman: { fontSize: 10, fontWeight: "bold", marginBottom: 2, marginTop: 4 },
  table: { borderWidth: 0.8, borderColor: ink, marginBottom: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: ink },
  th: { fontWeight: "bold", fontSize: 7, padding: 3, textAlign: "center" },
  td: { fontSize: 7.5, paddingVertical: 2, paddingHorizontal: 3 },
  cell: { borderRightWidth: 0.5, borderRightColor: ink },
  person: {
    width: "24%",
    borderLeftWidth: 0.5,
    borderLeftColor: ink,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  personName: { fontSize: 8, textAlign: "center" },
  signBlock: { marginTop: 4, marginBottom: 10, alignItems: "center" },
  signRow: { flexDirection: "row", justifyContent: "flex-end", width: "100%", alignItems: "flex-end", paddingRight: 18 },
  signLine: { width: 210, borderBottomWidth: 0.7, borderBottomColor: ink, marginRight: 4, height: 10 },
  signHint: { fontSize: 8, textAlign: "center", marginTop: 2 },
});

const COL = {
  n: "6%",
  inv: "12%",
  name: "48%",
  qty: "10%",
  person: "24%",
};
const LEFT = {
  n: "7.9%",
  inv: "15.8%",
  name: "63.1%",
  qty: "13.2%",
};

export type AssignmentLine = { n: number; invNo: string; name: string; qty: number };

export type AssignmentGroup = {
  roman: string;
  fullName: string;
  position: string;
  signName: string;
  lines: AssignmentLine[];
};

export type AssignmentPdfData = {
  orderNo: string;
  orderDate: string;
  groups: AssignmentGroup[];
};

function Cell({
  w,
  last,
  children,
  align,
}: {
  w: string;
  last?: boolean;
  children: string | number;
  align?: "center" | "left" | "right";
}) {
  return (
    <Text style={[s.td, last ? {} : s.cell, { width: w, textAlign: align || "left" }]}>
      {children === 0 || children ? String(children) : " "}
    </Text>
  );
}

function PersonSection({ group }: { group: AssignmentGroup }) {
  const keep = group.lines.length <= 42;
  const last = Math.max(group.lines.length, 1) - 1;
  const rows = group.lines.length ? group.lines : [{ n: 0, invNo: "", name: " ", qty: 0 }];
  return (
    <View wrap={!keep} minPresenceAhead={72}>
      <Text style={s.roman}>{group.roman}</Text>
      <View style={s.table}>
        <View style={s.tr} wrap={false}>
          <Text style={[s.th, s.cell, { width: COL.n }]}>№</Text>
          <Text style={[s.th, s.cell, { width: COL.inv }]}>Инвент.{"\n"}номер</Text>
          <Text style={[s.th, s.cell, { width: COL.name }]}>Наименование, модель оборудования</Text>
          <Text style={[s.th, s.cell, { width: COL.qty }]}>Кол-во{"\n"}(шт.)</Text>
          <Text style={[s.th, { width: COL.person }]}>Ответственное лицо{"\n"}(ФИО, должность)</Text>
        </View>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: "76%" }}>
            {rows.map((line, i) => (
              <View
                key={`${group.roman}-${i}`}
                style={[s.tr, i === last ? { borderBottomWidth: 0 } : {}]}
                wrap={false}
              >
                <Cell w={LEFT.n} align="center">
                  {line.n || " "}
                </Cell>
                <Cell w={LEFT.inv} align="center">
                  {line.invNo || " "}
                </Cell>
                <Cell w={LEFT.name}>{line.name || " "}</Cell>
                <Cell w={LEFT.qty} last align="center">
                  {line.n ? line.qty : " "}
                </Cell>
              </View>
            ))}
          </View>
          <View style={s.person}>
            <Text style={s.personName}>{group.fullName}</Text>
            {group.position ? <Text style={s.personName}>{group.position}</Text> : null}
          </View>
        </View>
      </View>
      <View style={s.signBlock} wrap={false}>
        <View style={s.signRow}>
          <View style={s.signLine} />
          <Text>/{group.signName}/</Text>
        </View>
        <Text style={s.signHint}>(подпись, расшифровка)</Text>
      </View>
    </View>
  );
}

export function AssignmentDocument({ data }: { data: AssignmentPdfData }) {
  const order = data.orderNo || "___";
  const when = data.orderDate || "__________";
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.appHead}>
          <Text>Приложение № 1 к приказу № {order}</Text>
          <Text>от {when}г.</Text>
        </View>
        <Text style={s.title}>ПЕРЕЧЕНЬ</Text>
        <Text style={s.titleSub}>
          оборудования, закрепляемого за ответственными лицами,{"\n"}ответственные лица
        </Text>
        {data.groups.length ? (
          data.groups.map((g) => <PersonSection key={g.roman} group={g} />)
        ) : (
          <Text>Нет оборудования, закреплённого за сотрудниками.</Text>
        )}
      </Page>
    </Document>
  );
}

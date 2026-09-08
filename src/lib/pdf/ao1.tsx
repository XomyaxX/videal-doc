import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import path from "path";
import { rubKopText, sumInWords } from "./money-words";

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
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 32,
  },
  tiny: { fontSize: 6.5 },
  small: { fontSize: 7 },
  right: { textAlign: "right" },
  bold: { fontWeight: "bold" },
  center: { textAlign: "center" },
  italic: { fontSize: 6.5, color: "#333" },
  line: { borderBottomWidth: 0.8, borderBottomColor: ink },
  box: { borderWidth: 0.8, borderColor: ink },
  row: { flexDirection: "row" },
  grow: { flexGrow: 1 },
  img: { width: 520, maxHeight: 680, objectFit: "contain", marginTop: 8 },
  pageBack: {
    fontFamily: "DejaVu",
    fontSize: 8,
    color: ink,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
});

const BACK = {
  n: 24,
  date: 50,
  num: 50,
  name: 108,
  rub: 52,
  val: 50,
  debit: 66,
} as const;
const BACK_COLS = [BACK.n, BACK.date, BACK.num, BACK.name, BACK.rub, BACK.val, BACK.rub, BACK.val, BACK.debit];

export type Ao1Data = {
  orgName: string;
  orgCodes: string;
  orgOkpo: string;
  directorTitle: string;
  directorName: string;
  accountantName: string;
  debitAccount: string;
  number: string;
  date: string;
  day: string;
  month: string;
  year2: string;
  employee: string;
  employeeShort: string;
  position: string;
  department: string;
  personnelNumber: string;
  purpose: string;
  issued: number;
  spent: number;
  receipts: {
    n: number;
    date: string;
    number: string;
    name: string;
    amount: number;
  }[];
  images: { title: string; dataUrl?: string }[];
};

function Cell({
  w,
  h,
  children,
  style,
  center,
}: {
  w?: number | string;
  h?: number;
  children?: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  style?: any;
  center?: boolean;
}) {
  return (
    <View
      style={[
        {
          borderWidth: 0.7,
          borderColor: ink,
          paddingHorizontal: 3,
          paddingVertical: 0,
          justifyContent: "center",
          overflow: "hidden",
          ...(w !== undefined ? { width: w } : { flexGrow: 1 }),
          ...(h ? { height: h, minHeight: h } : {}),
        },
        center ? { alignItems: "center" } : {},
        style || {},
      ]}
    >
      {typeof children === "string" || typeof children === "number" ? (
        <Text style={{ fontSize: 7, lineHeight: 1 }}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function T({ children, style }: { children?: ReactNode; style?: any }) {
  return <Text style={[{ fontSize: 7.5 }, style]}>{children}</Text>;
}

export function Ao1Document({ data }: { data: Ao1Data }) {
  const spent = rubKopText(data.spent);
  const issued = rubKopText(data.issued);
  const restKop = data.issued - data.spent;
  const rest = rubKopText(Math.abs(restKop));
  const remainder = restKop >= 0;
  const words = sumInWords(data.spent);
  const docs = String(data.receipts.length || "");
  const sheets = String((data.receipts.length ? data.images.length : 0) + 2);
  const rows = Array.from({ length: 30 }, (_, i) => data.receipts[i] || null);

  return (
    <Document>
      <Page size="A4" orientation="portrait" wrap={false} style={s.page}>
        <Text style={[s.tiny, s.right]}>Унифицированная форма № АО-1</Text>
        <Text style={[s.tiny, s.right]}>Утверждена Постановлением Госкомстата России</Text>
        <Text style={[s.tiny, s.right, { marginBottom: 6 }]}>от 01.08.2001 № 55</Text>

        <View style={[s.row, { justifyContent: "space-between", alignItems: "flex-start" }]}>
          <View style={{ width: 310 }}>
            <View style={[s.line, { minHeight: 18, justifyContent: "flex-end", paddingBottom: 1 }]}>
              <T style={{ fontSize: 8, fontWeight: "bold" }}>{data.orgName}</T>
            </View>
            {data.orgCodes ? <T style={[s.tiny, s.center]}>{data.orgCodes}</T> : null}
            <T style={[s.italic, s.center]}>(наименование организации)</T>
          </View>
          <View>
            <View style={[s.row, { justifyContent: "flex-end" }]}>
              <T style={{ width: 88, textAlign: "right", paddingRight: 4, paddingTop: 3 }}>Код</T>
              <Cell w={70} h={14} center>
                <T />
              </Cell>
            </View>
            <View style={s.row}>
              <T style={{ width: 88, textAlign: "right", paddingRight: 4, paddingTop: 3 }}>Форма по ОКУД</T>
              <Cell w={70} h={14} center>
                <T style={s.bold}>0302001</T>
              </Cell>
            </View>
            <View style={s.row}>
              <T style={{ width: 88, textAlign: "right", paddingRight: 4, paddingTop: 3 }}>по ОКПО</T>
              <Cell w={70} h={14} center>
                <T>{data.orgOkpo}</T>
              </Cell>
            </View>
          </View>
        </View>

        <View style={[s.row, { marginTop: 8, alignItems: "flex-start" }]}>
          <View style={{ width: 300, paddingTop: 18 }}>
            <Text style={{ fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>АВАНСОВЫЙ ОТЧЕТ</Text>
            <View style={s.row}>
              <Cell w={70} h={16} center>
                <T style={s.small}>Номер</T>
              </Cell>
              <Cell w={78} h={16} center>
                <T style={s.small}>Дата</T>
              </Cell>
            </View>
            <View style={s.row}>
              <Cell w={70} h={16} center>
                <T style={s.bold}>{data.number}</T>
              </Cell>
              <Cell w={78} h={16} center>
                <T style={s.bold}>{data.date}</T>
              </Cell>
            </View>
          </View>
          <View style={{ flexGrow: 1, paddingLeft: 16 }}>
            <T style={[s.bold, { fontSize: 9 }]}>УТВЕРЖДАЮ</T>
            <View style={[s.row, { marginTop: 4, alignItems: "flex-end" }]}>
              <T>Отчет в сумме</T>
              <View style={[s.line, { flexGrow: 1, marginLeft: 6, minHeight: 12 }]}>
                <T style={[s.bold, s.right]}>{spent.rub}</T>
              </View>
            </View>
            <View style={[s.row, { marginTop: 2 }]}>
              <View style={[s.line, { width: 90, marginRight: 4 }]}>
                <T style={s.center}>{spent.rub}</T>
              </View>
              <T>руб.</T>
              <View style={[s.line, { width: 28, marginHorizontal: 4 }]}>
                <T style={s.center}>{spent.kop}</T>
              </View>
              <T>коп.</T>
            </View>
            <View style={[s.row, { marginTop: 6, alignItems: "flex-end" }]}>
              <T>Руководитель</T>
              <View style={[s.line, { flexGrow: 1, marginLeft: 6 }]}>
                <T>{data.directorTitle}</T>
              </View>
            </View>
            <T style={[s.italic, s.center]}>(должность)</T>
            <View style={[s.row, { marginTop: 4 }]}>
              <View style={[s.line, { width: 90 }]} />
              <View style={[s.line, { flexGrow: 1, marginLeft: 8 }]}>
                <T style={s.center}>{data.directorName}</T>
              </View>
            </View>
            <View style={s.row}>
              <T style={[s.italic, { width: 90, textAlign: "center" }]}>(подпись)</T>
              <T style={[s.italic, { flexGrow: 1, textAlign: "center" }]}>(расшифровка подписи)</T>
            </View>
            <T style={{ marginTop: 4 }}>
              « {data.day || "____"} » {data.month || "____________"} 20{data.year2 || "__"} г.
            </T>
          </View>
        </View>

        <View style={[s.row, { marginTop: 10, alignItems: "flex-end" }]}>
          <T>Структурное подразделение</T>
          <View style={[s.line, { flexGrow: 1, marginLeft: 8 }]}>
            <T style={s.bold}>{data.department || "Офис"}</T>
          </View>
          <View style={{ marginLeft: 12 }}>
            <T style={[s.center, s.small]}>Код</T>
            <Cell w={70} h={14} />
          </View>
        </View>
        <View style={[s.row, { marginTop: 4, alignItems: "flex-end" }]}>
          <T>Подотчетное лицо</T>
          <View style={[s.line, { flexGrow: 1, marginLeft: 8 }]}>
            <T style={s.bold}>{data.employeeShort}</T>
          </View>
          <T style={{ marginLeft: 8 }}>Табельный номер</T>
          <Cell w={70} h={14} center>
            <T>{data.personnelNumber}</T>
          </Cell>
        </View>
        <T style={[s.italic, { marginLeft: 110 }]}>(фамилия, инициалы)</T>
        <View style={[s.row, { marginTop: 2, alignItems: "flex-end" }]}>
          <T>Профессия (должность)</T>
          <View style={[s.line, { width: 160, marginLeft: 8 }]}>
            <T>{data.position}</T>
          </View>
          <T style={{ marginLeft: 8 }}>Назначение аванса</T>
          <View style={[s.line, { flexGrow: 1, marginLeft: 8 }]}>
            <T style={s.bold}>{data.purpose || "Хоз расходы"}</T>
          </View>
        </View>

        <View style={[s.row, { marginTop: 8 }]}>
          <View style={{ width: 248 }}>
            <View style={s.row}>
              <Cell w={168} h={22} center>
                <T style={s.bold}>Наименование показателя</T>
              </Cell>
              <Cell w={80} h={22} center>
                <T style={s.bold}>Сумма, руб.коп.</T>
              </Cell>
            </View>
            <IndRow label={"Предыдущий аванс          остаток"} value="" />
            <IndRow label={"                                     перерасход"} value="" />
            <IndRow label="Получен аванс 1. из кассы" value={issued.rub ? `${issued.rub}.${issued.kop}` : ""} />
            <IndRow label="1а. в валюте (справочно)" value="" />
            <IndRow label="2." value="" />
            <IndRow label="" value="" />
            <IndRow label="Итого получено" value={issued.rub ? `${issued.rub}.${issued.kop}` : ""} />
            <IndRow label="Израсходовано" value={`${spent.rub}.${spent.kop}`} />
            <IndRow label="Остаток" value={remainder ? `${rest.rub}.${rest.kop}` : ""} />
            <IndRow label="Перерасход" value={!remainder ? `${rest.rub}.${rest.kop}` : ""} />
          </View>
          <View style={{ width: 12 }} />
          <View style={{ flexGrow: 1 }}>
            <View style={s.row}>
              <Cell w={280} h={15} center>
                <T style={s.bold}>Бухгалтерская запись</T>
              </Cell>
            </View>
            <View style={s.row}>
              <Cell w={140} h={14} center>
                <T>дебет</T>
              </Cell>
              <Cell w={140} h={14} center>
                <T>кредит</T>
              </Cell>
            </View>
            <View style={s.row}>
              <Cell w={70} h={16} center>
                <T style={s.tiny}>счет, субсчет</T>
              </Cell>
              <Cell w={70} h={16} center>
                <T style={s.tiny}>сумма, руб.коп.</T>
              </Cell>
              <Cell w={70} h={16} center>
                <T style={s.tiny}>счет, субсчет</T>
              </Cell>
              <Cell w={70} h={16} center>
                <T style={s.tiny}>сумма, руб.коп.</T>
              </Cell>
            </View>
            {Array.from({ length: 8 }).map((_, i) => (
              <View key={i} style={s.row}>
                <Cell w={70} h={15} />
                <Cell w={70} h={15} />
                <Cell w={70} h={15} />
                <Cell w={70} h={15} />
              </View>
            ))}
          </View>
        </View>

        <View style={[s.row, { marginTop: 8, alignItems: "flex-end" }]}>
          <T>Приложение</T>
          <View style={[s.line, { width: 36, marginHorizontal: 6 }]}>
            <T style={s.center}>{docs}</T>
          </View>
          <T>документов на</T>
          <View style={[s.line, { width: 36, marginHorizontal: 6 }]}>
            <T style={s.center}>{sheets}</T>
          </View>
          <T>листах</T>
        </View>

        <View style={{ marginTop: 8 }}>
          <T>Отчет проверен. К утверждению в сумме</T>
          <View style={[s.line, { marginTop: 2, minHeight: 12 }]}>
            <T>{words}</T>
          </View>
          <T style={[s.italic, s.center]}>(сумма прописью)</T>
          <View style={[s.row, { marginTop: 2 }]}>
            <View style={[s.line, { width: 70 }]}>
              <T style={s.center}>{spent.rub}</T>
            </View>
            <T style={{ marginHorizontal: 4 }}>руб.</T>
            <View style={[s.line, { width: 28 }]}>
              <T style={s.center}>{spent.kop}</T>
            </View>
            <T style={{ marginHorizontal: 4 }}>коп. (</T>
            <View style={[s.line, { width: 70 }]}>
              <T style={s.center}>{spent.rub}</T>
            </View>
            <T style={{ marginHorizontal: 4 }}>руб.</T>
            <View style={[s.line, { width: 28 }]}>
              <T style={s.center}>{spent.kop}</T>
            </View>
            <T> коп.)</T>
          </View>
        </View>

        <SignLine label="Главный бухгалтер" name={data.accountantName} />
        <SignLine label="Бухгалтер" name="" />

        <View style={[s.row, { marginTop: 8, alignItems: "flex-end" }]}>
          <View>
            <T style={remainder ? s.bold : undefined}>Остаток внесен</T>
            <T style={!remainder ? s.bold : undefined}>Перерасход выдан</T>
          </View>
          <T style={{ marginLeft: 10 }}>в сумме</T>
          <Cell w={70} h={16} center>
            <T>{rest.rub}</T>
          </Cell>
          <T style={{ marginHorizontal: 4 }}>руб.</T>
          <Cell w={28} h={16} center>
            <T>{rest.kop}</T>
          </Cell>
          <T style={{ marginLeft: 4 }}>коп. по кассовому ордеру № ______ от « ____ » ________ 20 __ г.</T>
        </View>
        <View style={[s.row, { marginTop: 8, alignItems: "flex-end" }]}>
          <T>Бухгалтер (кассир)</T>
          <View style={[s.line, { width: 110, marginLeft: 8 }]} />
          <View style={[s.line, { width: 140, marginLeft: 8 }]} />
          <T style={{ marginLeft: 12 }}>« ____ » ________ 20 __ г.</T>
        </View>
        <View style={s.row}>
          <T style={[s.italic, { marginLeft: 108, width: 110, textAlign: "center" }]}>(подпись)</T>
          <T style={[s.italic, { width: 140, textAlign: "center" }]}>(расшифровка подписи)</T>
        </View>

        <Text style={{ textAlign: "center", fontSize: 7, marginTop: 8, letterSpacing: 3 }}>
          л и н и я о т р е з а
        </Text>
        <View style={{ borderTopWidth: 0.7, borderTopColor: ink, borderStyle: "dashed", marginTop: 2, paddingTop: 6 }}>
          <View style={[s.row, { alignItems: "flex-end" }]}>
            <T>Расписка. Принят к проверке от</T>
            <View style={[s.line, { width: 120, marginHorizontal: 4 }]}>
              <T style={s.center}>{data.employeeShort}</T>
            </View>
            <T>авансовый отчет №</T>
            <View style={[s.line, { width: 70, marginHorizontal: 4 }]}>
              <T style={s.center}>{data.number}</T>
            </View>
            <T>
              от « {data.day || "__"} » {data.month || "______"} 20{data.year2 || "__"} г.
            </T>
          </View>
          <View style={[s.row, { marginTop: 4, alignItems: "flex-end" }]}>
            <T>на сумму</T>
            <View style={[s.line, { flexGrow: 1, marginHorizontal: 6 }]}>
              <T>{words}</T>
            </View>
          </View>
          <T style={[s.italic, { marginLeft: 50 }]}>(прописью)</T>
          <View style={[s.row, { alignItems: "flex-end" }]}>
            <View style={[s.line, { width: 60 }]}>
              <T style={s.center}>{spent.rub}</T>
            </View>
            <T style={{ marginHorizontal: 4 }}>руб.</T>
            <View style={[s.line, { width: 24 }]}>
              <T style={s.center}>{spent.kop}</T>
            </View>
            <T style={{ marginHorizontal: 4 }}>коп., количество документов</T>
            <View style={[s.line, { width: 28, marginHorizontal: 4 }]}>
              <T style={s.center}>{docs}</T>
            </View>
            <T>на</T>
            <View style={[s.line, { width: 28, marginHorizontal: 4 }]}>
              <T style={s.center}>{sheets}</T>
            </View>
            <T>листах</T>
          </View>
          <View style={[s.row, { marginTop: 8, alignItems: "flex-end" }]}>
            <T>Бухгалтер</T>
            <View style={[s.line, { width: 110, marginLeft: 8 }]} />
            <View style={[s.line, { width: 140, marginLeft: 8 }]} />
            <T style={{ marginLeft: 12 }}>
              « {data.day || "__"} » {data.month || "______"} 20{data.year2 || "__"} г.
            </T>
          </View>
          <View style={s.row}>
            <T style={[s.italic, { marginLeft: 64, width: 110, textAlign: "center" }]}>(подпись)</T>
            <T style={[s.italic, { width: 140, textAlign: "center" }]}>(расшифровка подписи)</T>
          </View>
        </View>
      </Page>

      <Page size="A4" orientation="portrait" wrap={false} style={s.pageBack}>
        <Text style={[s.tiny, s.right, { marginBottom: 8 }]}>Оборотная сторона формы № АО-1</Text>
        <View style={s.row}>
          <HeadCell w={BACK.n} h={36}>
            Номер{"\n"}по{"\n"}порядку
          </HeadCell>
          <View>
            <HeadCell w={BACK.date + BACK.num} h={18}>
              Документ, подтверждающий{"\n"}производственные расходы
            </HeadCell>
            <View style={s.row}>
              <HeadCell w={BACK.date} h={18}>
                дата
              </HeadCell>
              <HeadCell w={BACK.num} h={18}>
                номер
              </HeadCell>
            </View>
          </View>
          <HeadCell w={BACK.name} h={36}>
            Номенклатура
          </HeadCell>
          <View>
            <HeadCell w={BACK.rub * 2 + BACK.val * 2} h={12}>
              Сумма расхода
            </HeadCell>
            <View style={s.row}>
              <HeadCell w={BACK.rub + BACK.val} h={12}>
                по отчету
              </HeadCell>
              <HeadCell w={BACK.rub + BACK.val} h={12}>
                принятая к учету
              </HeadCell>
            </View>
            <View style={s.row}>
              <HeadCell w={BACK.rub} h={12}>
                в руб. коп.
              </HeadCell>
              <HeadCell w={BACK.val} h={12}>
                в валюте
              </HeadCell>
              <HeadCell w={BACK.rub} h={12}>
                в руб. коп.
              </HeadCell>
              <HeadCell w={BACK.val} h={12}>
                в валюте
              </HeadCell>
            </View>
          </View>
          <HeadCell w={BACK.debit} h={36}>
            Дебет счета,{"\n"}субсчета
          </HeadCell>
        </View>
        <View style={s.row}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((n, i) => (
            <HeadCell key={n} w={BACK_COLS[i]} h={12}>
              {n}
            </HeadCell>
          ))}
        </View>
        {rows.map((r, i) => {
          const amt = r ? `${rubKopText(r.amount).rub}.${rubKopText(r.amount).kop}` : "";
          return (
            <View key={i} style={s.row} wrap={false}>
              <BodyCell w={BACK.n}>{String(i + 1)}</BodyCell>
              <BodyCell w={BACK.date}>{r?.date || ""}</BodyCell>
              <BodyCell w={BACK.num}>{r?.number || ""}</BodyCell>
              <BodyCell w={BACK.name} left>
                {r?.name || ""}
              </BodyCell>
              <BodyCell w={BACK.rub}>{amt}</BodyCell>
              <BodyCell w={BACK.val} />
              <BodyCell w={BACK.rub}>{amt}</BodyCell>
              <BodyCell w={BACK.val} />
              <BodyCell w={BACK.debit}>{r ? data.debitAccount : ""}</BodyCell>
            </View>
          );
        })}
        <View style={s.row}>
          <View style={{ width: BACK.n + BACK.date + BACK.num }} />
          <BodyCell w={BACK.name}>
            <T style={s.bold}>Итого</T>
          </BodyCell>
          <BodyCell w={BACK.rub}>{`${spent.rub}.${spent.kop}`}</BodyCell>
          <BodyCell w={BACK.val} />
          <BodyCell w={BACK.rub}>{`${spent.rub}.${spent.kop}`}</BodyCell>
          <BodyCell w={BACK.val} />
          <View style={{ width: BACK.debit }} />
        </View>

        <View style={[s.row, { marginTop: 18, alignItems: "flex-end" }]}>
          <T style={{ fontSize: 9 }}>Подотчетное лицо</T>
          <View style={[s.line, { width: 140, marginLeft: 10 }]} />
          <View style={[s.line, { width: 180, marginLeft: 16 }]}>
            <T style={s.center}>{data.employeeShort}</T>
          </View>
        </View>
        <View style={s.row}>
          <T style={[s.italic, { marginLeft: 118, width: 140, textAlign: "center" }]}>(подпись)</T>
          <T style={[s.italic, { width: 180, textAlign: "center" }]}>(расшифровка подписи)</T>
        </View>
      </Page>

      {data.images.map((img, i) => (
        <Page key={i} size="A4" orientation="portrait" style={s.page}>
          <Text style={{ fontSize: 12, fontWeight: "bold" }}>Приложение {i + 1}</Text>
          <Text style={{ fontSize: 9, marginBottom: 8 }}>{img.title}</Text>
          {img.dataUrl ? <Image src={img.dataUrl} style={s.img} /> : <Text>Файл без превью (не изображение).</Text>}
        </Page>
      ))}
    </Document>
  );
}

function IndRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Cell w={168} h={15}>
        {label}
      </Cell>
      <Cell w={80} h={15} center>
        {value}
      </Cell>
    </View>
  );
}

function HeadCell({ w, h, children }: { w?: number | string; h: number; children?: ReactNode }) {
  return (
    <View
      style={{
        width: w,
        height: h,
        borderWidth: 0.7,
        borderColor: ink,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 1,
        ...(w === undefined ? { flexGrow: 1 } : {}),
      }}
    >
      <Text style={{ fontSize: 6.5, textAlign: "center", fontWeight: "bold" }}>{children}</Text>
    </View>
  );
}

function BodyCell({
  w,
  children,
  left,
}: {
  w: number;
  children?: ReactNode;
  left?: boolean;
}) {
  return (
    <View
      style={{
        width: w,
        height: 13,
        borderWidth: 0.6,
        borderColor: ink,
        justifyContent: "center",
        alignItems: left ? "flex-start" : "center",
        paddingHorizontal: 2,
      }}
    >
      <Text style={{ fontSize: 6.5 }}>{children}</Text>
    </View>
  );
}

function SignLine({ label, name }: { label: string; name: string }) {
  return (
    <View style={{ marginTop: 6 }}>
      <View style={[s.row, { alignItems: "flex-end" }]}>
        <T style={{ width: 110 }}>{label}</T>
        <View style={[s.line, { width: 120 }]} />
        <View style={[s.line, { flexGrow: 1, marginLeft: 10 }]}>
          <T>{name}</T>
        </View>
      </View>
      <View style={s.row}>
        <T style={[s.italic, { marginLeft: 110, width: 120, textAlign: "center" }]}>(подпись)</T>
        <T style={[s.italic, { flexGrow: 1, textAlign: "center" }]}>(расшифровка подписи)</T>
      </View>
    </View>
  );
}

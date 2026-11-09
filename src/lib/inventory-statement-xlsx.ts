import ExcelJS from "exceljs";
import type { InventoryStatement, StatementPerson } from "@/lib/inventory-statement";

const FILL = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const NAVY = FILL("FF1B3A6B");
const BAND = FILL("FFE8EEF6");
const GOLD = FILL("FFF4E8C8");
const SOFT = FILL("FFF7F7F5");

function paint(row: ExcelJS.Row, fill: ExcelJS.Fill, font?: Partial<ExcelJS.Font>) {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.fill = fill;
    cell.font = { name: "Calibri", size: 11, color: { argb: font?.color?.argb || "FF111111" }, bold: font?.bold };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD0D5DD" } },
      left: { style: "thin", color: { argb: "FFD0D5DD" } },
      bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
      right: { style: "thin", color: { argb: "FFD0D5DD" } },
    };
  });
}

function personTitle(person: StatementPerson) {
  const state = person.auditStatus === "open" ? "обход не завершён" : "обход закрыт";
  const dept = person.department ? ` · ${person.department}` : "";
  return `${person.name}${dept} · ${person.auditNumber} · ${state} · соответствует ${person.match}, расхождения ${person.missing + person.open}, передано ${person.transfer}`;
}

export async function renderInventoryStatementXlsx(data: InventoryStatement): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Видеал.Док";
  const title = data.scope === "round" ? "Сводная инвентаризационная ведомость" : "Инвентаризационная ведомость";

  const ws = wb.addWorksheet("Ведомость", {
    views: [{ state: "frozen", ySplit: 6 }],
    properties: { outlineLevelRow: 1 },
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 6 },
    { width: 16 },
    { width: 42 },
    { width: 12 },
    { width: 12 },
    { width: 36 },
    { width: 28 },
  ];
  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = data.org;
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1B3A6B" } };
  ws.mergeCells("A2:G2");
  ws.getCell("A2").value = `${title} ${data.number}`;
  ws.getCell("A2").font = { bold: true, size: 13 };
  ws.mergeCells("A3:G3");
  ws.getCell("A3").value = `ИНН ${data.inn} · начало ${data.startedAt} · окончание ${data.closedAt} · проводил ${data.conductor}`;
  ws.mergeCells("A4:G4");
  ws.getCell("A4").value = data.interim
    ? "Промежуточная, тур не закрыт"
    : `Итого: соответствует ${data.totals.match}, расхождения ${data.totals.discrepancy}, передано ${data.totals.transfer}`;
  ws.getCell("A4").font = { bold: true, color: { argb: data.interim ? "FF8A6A2F" : "FF111111" } };
  const head = ws.addRow(["№", "Инв. №", "Наименование", "По учёту", "По факту", "Результат", "Примечание"]);
  paint(head, NAVY, { bold: true, color: { argb: "FFFFFFFF" } });
  ws.addRow([]);

  for (const person of data.people) {
    const band = ws.addRow([personTitle(person), "", "", "", "", "", ""]);
    ws.mergeCells(band.number, 1, band.number, 7);
    paint(band, BAND, { bold: true, color: { argb: "FF1B3A6B" } });
    if (!person.lines.length) {
      const empty = ws.addRow(["", "", "Позиций в обходе нет", "", "", "", ""]);
      empty.outlineLevel = 1;
      paint(empty, SOFT);
      continue;
    }
    person.lines.forEach((line, index) => {
      const row = ws.addRow([
        index + 1,
        line.invNo,
        line.title,
        line.bookQty,
        line.factQty ?? "",
        line.result,
        line.note,
      ]);
      row.outlineLevel = 1;
      paint(row, line.kind === "transfer" ? GOLD : SOFT, { bold: false });
    });
  }

  const sum = wb.addWorksheet("Итоги", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 } });
  sum.columns = [{ width: 36 }, { width: 18 }, { width: 18 }, { width: 16 }, { width: 16 }];
  sum.addRow([title, data.number]);
  sum.addRow(["Организация", data.org]);
  sum.addRow(["ИНН", data.inn]);
  sum.addRow(["Начало", data.startedAt]);
  sum.addRow(["Окончание", data.closedAt]);
  sum.addRow(["Проводил", data.conductor]);
  sum.addRow(["Статус", data.interim ? "промежуточная, тур не закрыт" : "тур закрыт"]);
  sum.addRow([]);
  const totalHead = sum.addRow(["", "Соответствует", "Расхождения", "Передано", "Позиций"]);
  paint(totalHead, NAVY, { bold: true, color: { argb: "FFFFFFFF" } });
  const totalRow = sum.addRow(["Весь документ", data.totals.match, data.totals.discrepancy, data.totals.transfer, data.totals.positions]);
  paint(totalRow, BAND, { bold: true });
  for (const person of data.people) {
    const row = sum.addRow([
      person.name,
      person.match,
      person.missing + person.open,
      person.transfer,
      person.match + person.missing + person.open + person.transfer,
    ]);
    paint(row, SOFT);
  }
  sum.addRow([]);
  sum.addRow(["Комиссия", "Должность", "Подпись", "ФИО"]);
  for (const role of ["Председатель", "Член комиссии", "Член комиссии"]) {
    sum.addRow([role, "", "", ""]);
  }

  const miss = wb.addWorksheet("Не проверены", { pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1 } });
  miss.columns = [{ width: 36 }, { width: 28 }, { width: 22 }, { width: 22 }];
  const missHead = miss.addRow(["Сотрудник", "Подразделение", "Состояние", "Обход"]);
  paint(missHead, NAVY, { bold: true, color: { argb: "FFFFFFFF" } });
  if (!data.unchecked.length) {
    miss.addRow(["Все действующие сотрудники тура отмечены закрытым обходом", "", "", ""]);
  } else {
    for (const person of data.unchecked) {
      const row = miss.addRow([
        person.name,
        person.department,
        person.state === "open" ? "идёт, не завершён" : "не начат",
        person.auditNumber,
      ]);
      paint(row, person.state === "open" ? GOLD : SOFT);
    }
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}

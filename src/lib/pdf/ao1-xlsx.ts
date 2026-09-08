import path from "path";
import ExcelJS from "exceljs";
import { loadAo1Bundle } from "./ao1-data";
import { rubKopText } from "./money-words";

export async function renderAdvanceXlsx(reportId: string): Promise<Buffer> {
  const { data, words, issuedStr, spentStr, restStr, remainder, docs, sheets } = await loadAo1Bundle(reportId);
  const template = path.join(/* turbopackIgnore: true */ process.cwd(), "templates", "ao1_template.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(/* turbopackIgnore: true */ template);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("В шаблоне АО-1 нет листа");

  const set = (addr: string, value: ExcelJS.CellValue) => {
    ws.getCell(addr).value = value;
  };

  set("A7", data.orgCodes ? `${data.orgName}\n${data.orgCodes}` : data.orgName);
  set("P19", data.department || "Офис");
  set("K20", data.employeeShort);
  set("AI95", data.employeeShort);
  set("N22", data.position);
  set("AI22", data.purpose);
  set("U13", data.number);
  set("Z13", data.date);
  if (data.personnelNumber) set("AR20", data.personnelNumber);
  set("AM16", data.day);
  set("AP16", data.month);
  set("AZ16", data.year2);
  set("AQ10", Number(spentStr));
  set("R27", Number(issuedStr));
  set("R31", Number(issuedStr));
  set("R32", Number(spentStr));
  if (remainder) {
    set("R33", Number(restStr));
    set("B33", "Остаток");
    set("R34", "");
    set("O44", Number(restStr));
  } else {
    set("R34", Number(restStr));
    set("B34", "Перерасход");
    set("R33", "");
    set("O45", Number(restStr));
  }
  set("S38", words);
  set("G36", docs);
  set("S36", sheets);
  set("Y39", Number(spentStr));
  set("P93", "Итого");
  set("Y93", Number(spentStr));
  set("AK93", Number(spentStr));
  set("I51", Number(spentStr));
  set("AE51", docs);
  set("AR51", sheets);

  for (let i = 0; i < 30; i++) {
    const row = 63 + i;
    const rec = data.receipts[i];
    set(`A${row}`, i + 1);
    if (rec) {
      const amt = Number(`${rubKopText(rec.amount).rub}.${rubKopText(rec.amount).kop}`);
      set(`F${row}`, rec.date);
      set(`K${row}`, rec.number ? `№${rec.number}, ${rec.name}` : rec.name);
      set(`Y${row}`, amt);
      set(`AK${row}`, amt);
      set(`AW${row}`, data.debitAccount || "");
    } else {
      set(`F${row}`, "");
      set(`K${row}`, "");
      set(`Y${row}`, "");
      set(`AK${row}`, "");
      set(`AW${row}`, "");
    }
  }

  // Row 57 is «Оборотная сторона формы № АО-1». Break after 56 so the reverse side starts a new sheet.
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = true;
  ws.pageSetup.fitToWidth = 1;
  ws.pageSetup.fitToHeight = 0;
  ws.pageSetup.printArea = "A1:BC96";
  ws.getRow(56).addPageBreak();

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

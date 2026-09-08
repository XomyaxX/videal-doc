import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const rows = await prisma.inventoryItem.findMany({
    where: { deletedAt: null },
    include: { user: { select: USER_SAFE_SELECT } },
    orderBy: [{ holderName: "asc" }, { invNo: "asc" }],
  });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Инвентарь");
  ws.columns = [
    { header: "Инв. №", key: "invNo", width: 14 },
    { header: "Наименование", key: "name", width: 42 },
    { header: "Кол-во", key: "qty", width: 8 },
    { header: "Сотрудник", key: "who", width: 28 },
    { header: "Логин", key: "login", width: 16 },
    { header: "Имя ПК", key: "pcHost", width: 22 },
    { header: "Процессор", key: "pcCpu", width: 32 },
    { header: "Видеокарта", key: "pcGpu", width: 28 },
    { header: "ОЗУ", key: "pcRam", width: 24 },
    { header: "Накопитель", key: "pcDisk", width: 36 },
    { header: "Материнская плата", key: "pcMb", width: 28 },
    { header: "Примечание", key: "note", width: 28 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    ws.addRow({
      invNo: r.invNo,
      name: r.name,
      qty: r.qty,
      who: r.user ? fullName(r.user) : r.holderName || "место пустует",
      login: r.user?.login || "",
      pcHost: r.pcHost,
      pcCpu: r.pcCpu,
      pcGpu: r.pcGpu,
      pcRam: r.pcRam,
      pcDisk: r.pcDisk,
      pcMb: r.pcMb,
      note: r.note,
    });
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("inventar.xlsx")}`,
    },
  });
}

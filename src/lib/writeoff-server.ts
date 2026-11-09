import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fullName } from "@/lib/names";
import { nextNumber } from "@/lib/sequence";
import {
  WriteOffError,
  actDateYmd,
  buildWriteOffPrint,
  clip,
  commissionReady,
  defaultWriteOffCommission,
  itemTitle,
  normalizeLineReason,
  normalizeReason,
  parseActDate,
  parseCommission,
  parseQty,
  parseWriteOffPrint,
  readIdList,
  readManual,
  type WriteOffLineDTO,
  type WriteOffPickItem,
  type WriteOffPrint,
  type WriteOffSheetDTO,
} from "@/lib/writeoff";

const authorSelect = { lastName: true, firstName: true, middleName: true };

function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function sheetDTO(row: {
  id: string;
  number: string;
  actDate: Date;
  status: string;
  reason: string;
  reasonText: string;
  basis: string;
  note: string;
  commissionJson: string;
  createdAt: Date;
  closedAt: Date | null;
  author: { lastName: string; firstName: string; middleName: string };
  lines: {
    id: string;
    inventoryItemId: string;
    title: string;
    invNo: string;
    qty: number;
    reason: string;
    note: string;
    sortOrder: number;
  }[];
}): WriteOffSheetDTO {
  return {
    id: row.id,
    number: row.number,
    actDate: actDateYmd(row.actDate),
    status: row.status,
    reason: row.reason,
    reasonText: row.reasonText,
    basis: row.basis,
    note: row.note,
    commission: parseCommission(row.commissionJson),
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() || null,
    author: fullName(row.author),
    lines: [...row.lines]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(
        (l): WriteOffLineDTO => ({
          id: l.id,
          inventoryItemId: l.inventoryItemId,
          title: l.title,
          invNo: l.invNo,
          qty: l.qty,
          reason: l.reason,
          note: l.note,
        }),
      ),
  };
}

const sheetInclude = {
  author: { select: authorSelect },
  lines: { orderBy: { sortOrder: "asc" as const } },
};

async function assertItemsAvailable(tx: Prisma.TransactionClient, itemIds: string[], exceptSheetId?: string) {
  if (!itemIds.length) return new Map<string, { id: string; name: string; invNo: string; qty: number; pcHost: string; userId: string | null; holderName: string; status: string; deletedAt: Date | null }>();
  if (new Set(itemIds).size !== itemIds.length) throw new WriteOffError(400, "Позиция указана дважды");
  const items = await tx.inventoryItem.findMany({ where: { id: { in: itemIds } } });
  const byId = new Map(items.map((it) => [it.id, it]));
  for (const id of itemIds) {
    const it = byId.get(id);
    if (!it || it.deletedAt || it.status === "written_off") {
      throw new WriteOffError(400, "Позиция недоступна для списания");
    }
  }
  const busy = await tx.writeOffLine.findMany({
    where: {
      inventoryItemId: { in: itemIds },
      sheet: {
        status: "open",
        ...(exceptSheetId ? { id: { not: exceptSheetId } } : {}),
      },
    },
    select: { sheet: { select: { number: true } } },
  });
  if (busy.length) {
    const nums = [...new Set(busy.map((b) => b.sheet.number))].join(", ");
    throw new WriteOffError(409, `Позиция уже в открытом акте ${nums}`);
  }
  if (exceptSheetId) {
    const same = await tx.writeOffLine.findFirst({
      where: { sheetId: exceptSheetId, inventoryItemId: { in: itemIds } },
      select: { id: true },
    });
    if (same) throw new WriteOffError(409, "Позиция уже есть в этом акте");
  }
  return byId;
}

export async function listWriteOffCandidates(exceptSheetId?: string): Promise<WriteOffPickItem[]> {
  const busy = await prisma.writeOffLine.findMany({
    where: {
      inventoryItemId: { not: "" },
      sheet: {
        status: "open",
        ...(exceptSheetId ? { id: { not: exceptSheetId } } : {}),
      },
    },
    select: { inventoryItemId: true },
  });
  const own = exceptSheetId
    ? await prisma.writeOffLine.findMany({
        where: { sheetId: exceptSheetId, inventoryItemId: { not: "" } },
        select: { inventoryItemId: true },
      })
    : [];
  const exclude = [...new Set([...busy.map((b) => b.inventoryItemId), ...own.map((b) => b.inventoryItemId)])];
  const rows = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      status: { not: "written_off" },
      ...(exclude.length ? { id: { notIn: exclude } } : {}),
    },
    include: { user: { select: authorSelect } },
    orderBy: [{ invNo: "asc" }, { name: "asc" }],
  });
  return rows.map((it) => ({
    id: it.id,
    invNo: it.invNo,
    name: it.pcHost ? `${it.name} (${it.pcHost})` : it.name,
    qty: it.qty,
    holder: it.user ? fullName(it.user) : it.holderName,
  }));
}

export async function getWriteOffSheet(id: string) {
  const row = await prisma.writeOffSheet.findUnique({ where: { id }, include: sheetInclude });
  return row ? sheetDTO(row) : null;
}

export async function createWriteOffSheet(authorId: string, body: unknown) {
  const raw = asRecord(body);
  const reason = normalizeReason(raw.reason);
  const reasonText = clip(raw.reasonText, 500);
  const basis = clip(raw.basis, 500);
  const note = clip(raw.note, 2000);
  const actDate = parseActDate(raw.actDate);
  const commission = raw.commission == null ? defaultWriteOffCommission() : parseCommission(raw.commission);
  const itemIds = readIdList(raw.itemIds);
  const manual = readManual(raw.manual);

  const number = await nextNumber("writeoff", "СП");
  const sheet = await prisma.$transaction(async (tx) => {
    const byId = await assertItemsAvailable(tx, itemIds);
    const lines = itemIds.map((id, i) => {
      const it = byId.get(id)!;
      return {
        inventoryItemId: it.id,
        title: itemTitle(it),
        invNo: it.invNo,
        qty: it.qty,
        reason: "",
        note: "",
        prevUserId: it.userId || "",
        prevHolderName: it.holderName || "",
        sortOrder: i,
      };
    });
    if (manual) {
      lines.push({
        inventoryItemId: "",
        title: manual.title,
        invNo: manual.invNo,
        qty: manual.qty,
        reason: manual.reason,
        note: manual.note,
        prevUserId: "",
        prevHolderName: "",
        sortOrder: lines.length,
      });
    }
    return tx.writeOffSheet.create({
      data: {
        number,
        actDate,
        authorId,
        reason,
        reasonText,
        basis,
        note,
        commissionJson: JSON.stringify(commission),
        status: "open",
        lines: { create: lines },
      },
      include: sheetInclude,
    });
  });
  await audit({
    userId: authorId,
    action: "writeoff.create",
    entity: "writeoff",
    entityId: sheet.id,
    details: sheet.number,
  });
  return sheetDTO(sheet);
}

export async function updateWriteOffSheet(id: string, userId: string, body: unknown) {
  const raw = asRecord(body);
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.writeOffSheet.findUnique({ where: { id }, include: { lines: true } });
    if (!row) throw new WriteOffError(404, "Нет акта");
    if (row.status !== "open") throw new WriteOffError(409, "Акт уже закрыт или отменён");

    const data: Prisma.WriteOffSheetUpdateInput = {};
    if ("actDate" in raw) data.actDate = parseActDate(raw.actDate, row.actDate);
    if ("reason" in raw) data.reason = normalizeReason(raw.reason, normalizeReason(row.reason));
    if ("reasonText" in raw) data.reasonText = clip(raw.reasonText, 500);
    if ("basis" in raw) data.basis = clip(raw.basis, 500);
    if ("note" in raw) data.note = clip(raw.note, 2000);
    if ("commission" in raw) data.commissionJson = JSON.stringify(parseCommission(raw.commission));
    if (Object.keys(data).length) await tx.writeOffSheet.update({ where: { id }, data });

    if (Array.isArray(raw.lines)) {
      for (const line of raw.lines) {
        if (!line || typeof line !== "object") continue;
        const rec = line as Record<string, unknown>;
        const lineId = String(rec.id || "");
        if (!lineId) continue;
        await tx.writeOffLine.updateMany({
          where: { id: lineId, sheetId: id },
          data: {
            reason: normalizeLineReason(rec.reason),
            note: clip(rec.note, 400),
            qty: parseQty(rec.qty),
          },
        });
      }
    }

    const removeIds = readIdList(raw.removeLineIds);
    if (removeIds.length) {
      await tx.writeOffLine.deleteMany({ where: { sheetId: id, id: { in: removeIds } } });
    }

    const addItemIds = readIdList(raw.addItemIds);
    const byId = await assertItemsAvailable(tx, addItemIds, id);
    const fresh = await tx.writeOffLine.findMany({ where: { sheetId: id }, select: { sortOrder: true } });
    let sort = fresh.reduce((max, l) => Math.max(max, l.sortOrder), -1) + 1;
    for (const itemId of addItemIds) {
      const it = byId.get(itemId)!;
      await tx.writeOffLine.create({
        data: {
          sheetId: id,
          inventoryItemId: it.id,
          title: itemTitle(it),
          invNo: it.invNo,
          qty: it.qty,
          prevUserId: it.userId || "",
          prevHolderName: it.holderName || "",
          sortOrder: sort,
        },
      });
      sort += 1;
    }

    const manual = readManual(raw.manual);
    if (manual) {
      await tx.writeOffLine.create({
        data: {
          sheetId: id,
          inventoryItemId: "",
          title: manual.title,
          invNo: manual.invNo,
          qty: manual.qty,
          reason: manual.reason,
          note: manual.note,
          sortOrder: sort,
        },
      });
    }

    const next = await tx.writeOffSheet.findUnique({ where: { id }, include: sheetInclude });
    if (!next) throw new WriteOffError(404, "Нет акта");
    return next;
  });
  await audit({
    userId,
    action: "writeoff.update",
    entity: "writeoff",
    entityId: id,
    details: updated.number,
  });
  return sheetDTO(updated);
}

async function directorFields() {
  const org = await prisma.organization.findFirst({
    select: { directorName: true, directorTitle: true },
    orderBy: { createdAt: "asc" },
  });
  return { directorName: org?.directorName || "", directorTitle: org?.directorTitle || "" };
}

export async function closeWriteOffSheet(id: string, userId: string) {
  const director = await directorFields();
  const result = await prisma.$transaction(async (tx) => {
    const sheet = await tx.writeOffSheet.findUnique({
      where: { id },
      include: { lines: { orderBy: { sortOrder: "asc" } } },
    });
    if (!sheet) throw new WriteOffError(404, "Нет акта");
    if (sheet.status !== "open") throw new WriteOffError(409, "Акт уже закрыт или отменён");
    if (!sheet.lines.length) throw new WriteOffError(400, "Добавьте хотя бы одну позицию");
    const commission = parseCommission(sheet.commissionJson);
    if (!commissionReady(commission)) throw new WriteOffError(400, "Укажите хотя бы одно ФИО в комиссии");
    if (sheet.reason === "other" && !sheet.reasonText.trim()) {
      throw new WriteOffError(400, "Для причины «Иное» заполните текст");
    }
    const linked = sheet.lines.map((l) => l.inventoryItemId).filter(Boolean);
    if (new Set(linked).size !== linked.length) throw new WriteOffError(400, "В акте одна позиция указана дважды");

    for (const line of sheet.lines) {
      if (!line.inventoryItemId) continue;
      const item = await tx.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
      if (!item || item.deletedAt || item.status === "written_off") {
        throw new WriteOffError(409, `Позиция «${line.title}» недоступна. Акт не проведён.`);
      }
      await tx.writeOffLine.update({
        where: { id: line.id },
        data: { prevUserId: item.userId || "", prevHolderName: item.holderName || "" },
      });
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { status: "written_off", userId: null, holderName: "" },
      });
    }

    const print = buildWriteOffPrint({
      number: sheet.number,
      actDate: sheet.actDate,
      reason: sheet.reason,
      reasonText: sheet.reasonText,
      basis: sheet.basis,
      note: sheet.note,
      commission,
      lines: sheet.lines,
      directorTitle: director.directorTitle,
      directorName: director.directorName,
    });
    await tx.writeOffSheet.update({
      where: { id },
      data: {
        printJson: JSON.stringify(print),
        status: "done",
        closedAt: new Date(),
        closedById: userId,
      },
    });
    return { number: sheet.number, itemIds: linked };
  });
  await audit({
    userId,
    action: "writeoff.close",
    entity: "writeoff",
    entityId: id,
    details: result.itemIds.join(","),
  });
  return result;
}

export async function cancelWriteOffSheet(id: string, userId: string) {
  const sheet = await prisma.writeOffSheet.findUnique({
    where: { id },
    select: { id: true, status: true, number: true },
  });
  if (!sheet) throw new WriteOffError(404, "Нет акта");
  if (sheet.status !== "open") throw new WriteOffError(409, "Отменить можно только открытый акт");
  await prisma.writeOffSheet.update({
    where: { id },
    data: { status: "cancelled", closedAt: new Date(), closedById: userId },
  });
  await audit({
    userId,
    action: "writeoff.cancel",
    entity: "writeoff",
    entityId: id,
    details: sheet.number,
  });
}

export async function writeOffPdfModel(id: string): Promise<{ number: string; draft: boolean; cancelled: boolean; data: WriteOffPrint } | null> {
  const row = await prisma.writeOffSheet.findUnique({
    where: { id },
    include: { lines: { orderBy: { sortOrder: "asc" } } },
  });
  if (!row) return null;
  const director = await directorFields();
  const live = buildWriteOffPrint({
    number: row.number,
    actDate: row.actDate,
    reason: row.reason,
    reasonText: row.reasonText,
    basis: row.basis,
    note: row.note,
    commission: parseCommission(row.commissionJson),
    lines: row.lines,
    directorTitle: director.directorTitle,
    directorName: director.directorName,
  });
  const saved = row.status === "done" ? parseWriteOffPrint(row.printJson) : null;
  return {
    number: row.number,
    draft: row.status === "open",
    cancelled: row.status === "cancelled",
    data: saved ?? live,
  };
}

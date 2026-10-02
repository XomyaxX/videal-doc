import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

async function applyLine(opts: {
  itemId: string;
  action: string;
  toUserId: string;
  note: string;
}) {
  if (opts.action === "found") {
    await prisma.inventoryItem.update({
      where: { id: opts.itemId },
      data: { status: "ok" },
    });
    return;
  }
  if (opts.action === "question") {
    await prisma.inventoryItem.update({
      where: { id: opts.itemId },
      data: {
        status: "question",
        ...(opts.note.trim() ? { note: opts.note.trim().slice(0, 500) } : {}),
      },
    });
    return;
  }
  if (opts.action === "transfer") {
    if (!opts.toUserId) throw new Error("Укажите, кому передать");
    const person = await prisma.user.findFirst({
      where: { id: opts.toUserId, deletedAt: null },
      select: { id: true },
    });
    if (!person) throw new Error("Нет такого сотрудника");
    await prisma.inventoryItem.update({
      where: { id: opts.itemId },
      data: { userId: opts.toUserId, status: "ok", holderName: "" },
    });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.inventoryAudit.findUnique({ where: { id }, include: { lines: true } });
  if (!row) return NextResponse.json({ error: "Нет инвентаризации" }, { status: 404 });
  if (row.status !== "open") return NextResponse.json({ error: "Уже закрыта" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  if (body.finish) {
    const leftover = row.lines.filter((l) => !l.action);
    if (body.questionRest && leftover.length) {
      for (const l of leftover) {
        await prisma.inventoryAuditLine.update({
          where: { id: l.id },
          data: { action: "question", note: "не отмечено при обходе" },
        });
        await applyLine({ itemId: l.inventoryItemId, action: "question", toUserId: "", note: "не отмечено при обходе" });
      }
    }
    await prisma.inventoryAudit.update({
      where: { id },
      data: { status: "done", closedAt: new Date() },
    });
    await audit({
      userId: session.user.id,
      action: "inventory.audit.finish",
      entity: "inventory-audit",
      entityId: id,
    });
    return NextResponse.json({ ok: true });
  }

  const lineId = String(body.lineId || "");
  const action = String(body.action || "");
  if (!["found", "transfer", "question", ""].includes(action)) {
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  }
  const line = row.lines.find((l) => l.id === lineId);
  if (!line) return NextResponse.json({ error: "Нет позиции" }, { status: 400 });
  const toUserId = String(body.toUserId || "");
  const note = String(body.note || "").trim().slice(0, 300);
  try {
    if (action) {
      await applyLine({ itemId: line.inventoryItemId, action, toUserId, note });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
  await prisma.inventoryAuditLine.update({
    where: { id: lineId },
    data: { action, toUserId: action === "transfer" ? toUserId : "", note },
  });
  return NextResponse.json({ ok: true });
}

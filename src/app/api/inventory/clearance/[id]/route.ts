import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { fullName } from "@/lib/names";

const include = {
  user: {
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      login: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  },
  author: { select: { lastName: true, firstName: true, middleName: true } },
  lines: { orderBy: { sortOrder: "asc" as const } },
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.clearanceSheet.findUnique({ where: { id }, include });
  if (!row) return NextResponse.json({ error: "Нет листа" }, { status: 404 });
  const manage = userCan(session.user, "inventory.manage");
  if (!manage && row.userId !== session.user.id) return NextResponse.json({ error: "Нет права" }, { status: 403 });
  return NextResponse.json({
    manage,
    sheet: {
      id: row.id,
      number: row.number,
      status: row.status,
      reason: row.reason,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt?.toISOString() || null,
      employee: { id: row.user.id, name: fullName(row.user), dept: row.user.department?.name || "", position: row.user.position?.name || "" },
      author: fullName(row.author),
      lines: row.lines.map((l) => ({
        id: l.id,
        title: l.title,
        invNo: l.invNo,
        qty: l.qty,
        returned: l.returned,
        note: l.note,
        inventoryItemId: l.inventoryItemId,
      })),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.clearanceSheet.findUnique({ where: { id }, include: { lines: true } });
  if (!row) return NextResponse.json({ error: "Нет листа" }, { status: 404 });
  const body = await req.json().catch(() => ({}));

  if (body.addLine && row.status === "open") {
    const title = String(body.title || "").trim();
    if (!title) return NextResponse.json({ error: "Название строки" }, { status: 400 });
    await prisma.clearanceLine.create({
      data: {
        sheetId: id,
        title,
        invNo: String(body.invNo || "").trim(),
        qty: Number(body.qty) || 1,
        sortOrder: row.lines.length,
      },
    });
  }

  if (Array.isArray(body.lines) && row.status === "open" && body.status !== "done") {
    for (const l of body.lines) {
      if (!l?.id) continue;
      await prisma.clearanceLine.updateMany({
        where: { id: String(l.id), sheetId: id },
        data: {
          returned: Boolean(l.returned),
          note: String(l.note || "").trim().slice(0, 400),
        },
      });
    }
  }

  if (body.print && typeof body.print === "object") {
    const p = body.print as Record<string, unknown>;
    const blocks = Array.isArray(p.blocks) ? p.blocks : [];
    const printJson = JSON.stringify({
      fullName: String(p.fullName || "").trim().slice(0, 200),
      workplace: String(p.workplace || "").trim().slice(0, 200),
      position: String(p.position || "").trim().slice(0, 200),
      dismissedAt: String(p.dismissedAt || "").trim().slice(0, 40),
      blocks: blocks.slice(0, 8).map((b: { id?: string; title?: string; note?: string; signerRole?: string; signerName?: string }) => ({
        id: String(b?.id || "").slice(0, 40),
        title: String(b?.title || "").slice(0, 200),
        note: String(b?.note || "").slice(0, 4000),
        signerRole: String(b?.signerRole || "").slice(0, 120),
        signerName: String(b?.signerName || "").slice(0, 200),
      })),
    });
    await prisma.clearanceSheet.update({ where: { id }, data: { printJson } });
  }

  if (typeof body.note === "string" && row.status === "open") {
    await prisma.clearanceSheet.update({ where: { id }, data: { note: body.note.trim().slice(0, 2000) } });
  }
  if (typeof body.reason === "string" && row.status === "open") {
    const reason = ["dismissal", "transfer", "other"].includes(body.reason) ? body.reason : row.reason;
    await prisma.clearanceSheet.update({ where: { id }, data: { reason } });
  }

  if (body.status === "cancelled" && row.status === "open") {
    await prisma.clearanceSheet.update({ where: { id }, data: { status: "cancelled", closedAt: new Date() } });
  }

  if (body.status === "done" && row.status === "open") {
    await prisma.$transaction(async (tx) => {
      if (Array.isArray(body.lines)) {
        for (const l of body.lines) {
          if (!l?.id) continue;
          await tx.clearanceLine.updateMany({
            where: { id: String(l.id), sheetId: id },
            data: {
              returned: Boolean(l.returned),
              note: String(l.note || "").trim().slice(0, 400),
            },
          });
        }
      }
      if (body.unassign) {
        const lines = await tx.clearanceLine.findMany({ where: { sheetId: id } });
        const ids = lines.filter((l) => l.returned && l.inventoryItemId).map((l) => l.inventoryItemId as string);
        if (ids.length) {
          await tx.inventoryItem.updateMany({
            where: { id: { in: ids }, userId: row.userId },
            data: { userId: null, holderName: "" },
          });
        }
      }
      await tx.clearanceSheet.update({ where: { id }, data: { status: "done", closedAt: new Date() } });
    });
    await audit({ userId: session.user.id, action: "clearance.close", entity: "clearance", entityId: id });
  }

  const next = await prisma.clearanceSheet.findUnique({ where: { id }, include });
  return NextResponse.json({ ok: true, id: next?.id });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; receiptId: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "finance.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id, receiptId } = await ctx.params;
  const report = await prisma.advanceReport.findFirst({ where: { id, deletedAt: null } });
  if (!report) return NextResponse.json({ error: "Отчёт не найден" }, { status: 404 });
  if (report.userId !== session.user.id && !userCan(session.user, "finance.view_all")) {
    return NextResponse.json({ error: "Чужой отчёт" }, { status: 403 });
  }
  if (!["draft", "rework"].includes(report.status)) {
    return NextResponse.json({ error: "Отчёт уже на согласовании — позицию не убрать" }, { status: 400 });
  }
  const row = await prisma.receipt.findFirst({ where: { id: receiptId, reportId: id } });
  if (!row) return NextResponse.json({ error: "Нет такой позиции" }, { status: 404 });
  await prisma.receipt.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}

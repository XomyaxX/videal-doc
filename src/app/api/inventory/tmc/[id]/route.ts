import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { defaultTmcCommission, parseTmcCommission } from "@/lib/tmc";
import { shortName } from "@/lib/names";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const row = await prisma.tmcSheet.findUnique({
    where: { id },
    include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
  });
  if (!row) return NextResponse.json({ error: "Нет карточки" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const data: { note?: string; commissionJson?: string } = {};
  if (typeof body.note === "string") data.note = body.note.trim().slice(0, 2000);
  if (Array.isArray(body.commission)) {
    const fallback = defaultTmcCommission(shortName(row.user));
    data.commissionJson = JSON.stringify(parseTmcCommission(JSON.stringify(body.commission), fallback));
  }
  const updated = await prisma.tmcSheet.update({ where: { id }, data });
  return NextResponse.json({ ok: true, id: updated.id });
}

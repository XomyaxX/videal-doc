import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { officeYmd } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "presence.review")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const url = req.nextUrl;
  const from = url.searchParams.get("from") || officeYmd();
  const to = url.searchParams.get("to") || from;
  const [flags, days] = await Promise.all([
    prisma.attendanceFlag.findMany({
      where: { ymd: { gte: from, lte: to }, resolvedAt: null },
      include: { user: { select: { lastName: true, firstName: true, middleName: true, login: true } } },
      orderBy: [{ ymd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.attendanceDay.findMany({
      where: { ymd: { gte: from, lte: to } },
      include: { user: { select: { lastName: true, firstName: true, middleName: true, login: true } } },
      orderBy: [{ ymd: "asc" }, { user: { lastName: "asc" } }],
    }),
  ]);
  return NextResponse.json({ flags, days });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "presence.review")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Нет записи" }, { status: 400 });
  await prisma.attendanceFlag.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseUrgency } from "@/lib/notify-urgency";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const after = String(req.nextUrl.searchParams.get("after") || "").trim();
  const unread = await prisma.notification.count({
    where: { userId: session.user.id, readAt: null },
  });

  if (!after) {
    const last = await prisma.notification.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return NextResponse.json({ cursor: last?.id || "", items: [], unread });
  }

  const anchor = await prisma.notification.findFirst({
    where: { id: after, userId: session.user.id },
    select: { createdAt: true },
  });
  if (!anchor) {
    const last = await prisma.notification.findFirst({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return NextResponse.json({ cursor: last?.id || after, items: [], unread });
  }

  const rows = await prisma.notification.findMany({
    where: { userId: session.user.id, createdAt: { gt: anchor.createdAt } },
    orderBy: { createdAt: "asc" },
    take: 20,
    select: { id: true, title: true, urgency: true, createdAt: true },
  });
  const cursor = rows.length ? rows[rows.length - 1].id : after;
  return NextResponse.json({
    cursor,
    unread,
    items: rows.map((r) => ({ id: r.id, title: r.title, urgency: parseUrgency(r.urgency) })),
  });
}

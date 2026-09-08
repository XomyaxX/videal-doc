import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deviceNameFromUa } from "@/lib/origin";

function statusOf(row: { consumedAt: Date | null; deniedAt: Date | null; expiresAt: Date }) {
  if (row.consumedAt) return "ok" as const;
  if (row.deniedAt) return "denied" as const;
  if (row.expiresAt <= new Date()) return "expired" as const;
  return "pending" as const;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await params;
  const row = await prisma.authChallenge.findUnique({
    where: { id },
    include: { session: { select: { token: true, userAgent: true, ip: true } } },
  });
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json({ error: "Нет" }, { status: 404 });
  }
  const status = statusOf(row);
  const waitingHere = row.session.token === session.token;
  if (waitingHere) {
    return NextResponse.json({ id: row.id, status, expiresAt: row.expiresAt.toISOString() });
  }
  if (!session.user.totpOk) {
    return NextResponse.json({ error: "Сначала подтвердите этот телефон кодом" }, { status: 403 });
  }
  return NextResponse.json({
    id: row.id,
    status,
    expiresAt: row.expiresAt.toISOString(),
    from: deviceNameFromUa(row.session.userAgent),
    ip: row.session.ip || "",
  });
}

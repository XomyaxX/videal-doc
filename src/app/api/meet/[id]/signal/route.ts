import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMeetAccess } from "@/lib/meet";

const KINDS = new Set(["offer", "answer", "ice", "leave", "bye", "state"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const after = String(req.nextUrl.searchParams.get("after") || "");
  const since = after
    ? (await prisma.meetingSignal.findUnique({ where: { id: after }, select: { createdAt: true } }))?.createdAt
    : null;
  await prisma.meetingSignal.deleteMany({
    where: { meetingId: id, createdAt: { lt: new Date(Date.now() - 2 * 60 * 1000) } },
  });
  const rows = await prisma.meetingSignal.findMany({
    where: {
      meetingId: id,
      fromUserId: { not: session.user.id },
      OR: [{ toUserId: "" }, { toUserId: session.user.id }],
      ...(since ? { createdAt: { gte: since } } : { createdAt: { gte: new Date(Date.now() - 15 * 1000) } }),
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
  const list = after ? rows.filter((r) => r.id !== after) : rows;
  return NextResponse.json({
    signals: list.map((r) => ({
      id: r.id,
      from: r.fromUserId,
      to: r.toUserId,
      kind: r.kind,
      payload: r.payload,
    })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет совещания" }, { status: 404 });
  const body = await req.json().catch(() => null);
  const kind = String(body?.kind || "");
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Сигнал" }, { status: 400 });
  const payload = typeof body?.payload === "string" ? body.payload.slice(0, 20000) : JSON.stringify(body?.payload || {});
  const row = await prisma.meetingSignal.create({
    data: {
      meetingId: id,
      fromUserId: session.user.id,
      toUserId: String(body?.toUserId || "").slice(0, 40),
      kind,
      payload,
    },
  });
  return NextResponse.json({ id: row.id });
}

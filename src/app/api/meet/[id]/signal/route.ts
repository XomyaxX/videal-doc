import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { meetActor } from "@/lib/meet-guest";

const KINDS = new Set(["offer", "answer", "ice", "leave", "bye", "state"]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const actor = await meetActor(id);
  if (!actor) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
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
      fromUserId: { not: actor.id },
      OR: [{ toUserId: "" }, { toUserId: actor.id }],
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
  const { id } = await ctx.params;
  const actor = await meetActor(id);
  if (!actor) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const kind = String(body?.kind || "");
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Сигнал" }, { status: 400 });
  const payload = typeof body?.payload === "string" ? body.payload.slice(0, 20000) : JSON.stringify(body?.payload || {});
  const row = await prisma.meetingSignal.create({
    data: {
      meetingId: id,
      fromUserId: actor.id,
      toUserId: String(body?.toUserId || "").slice(0, 40),
      kind,
      payload,
    },
  });
  return NextResponse.json({ id: row.id });
}

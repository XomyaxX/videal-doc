import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireMeetAccess } from "@/lib/meet";
import { proposeFromSummary, seedProposedTasks } from "@/lib/meet-propose";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const items = await proposeFromSummary(id);
  let seeded: string[] = [];
  try {
    seeded = JSON.parse(meet.summaryTaskIds || "[]");
  } catch {
    seeded = [];
  }
  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    select: { id: true, lastName: true, firstName: true, middleName: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  return NextResponse.json({
    items,
    seeded,
    people: people.map((p) => ({ id: p.id, name: `${p.lastName} ${p.firstName}`.trim() })),
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? body.items : [];
  try {
    const ids = await seedProposedTasks({ user: session.user, meetingId: id, items });
    return NextResponse.json({ ok: true, ids });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

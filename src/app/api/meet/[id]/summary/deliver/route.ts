import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireMeetAccess } from "@/lib/meet";
import { deliverMeetingSummary } from "@/lib/meet-deliver";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (meet.authorId !== session.user.id) return NextResponse.json({ error: "Отправить может организатор" }, { status: 403 });
  try {
    const status = await deliverMeetingSummary(id, true);
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

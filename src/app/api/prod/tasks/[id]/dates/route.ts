import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { applyDates } from "@/lib/prod-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const starts = body?.startsAt ? new Date(String(body.startsAt) + (String(body.startsAt).length === 10 ? "T12:00:00+06:00" : "")) : null;
  const due = body?.dueAt ? new Date(String(body.dueAt) + (String(body.dueAt).length === 10 ? "T12:00:00+06:00" : "")) : null;
  if (starts && Number.isNaN(starts.getTime())) return NextResponse.json({ error: "Неверная дата начала" }, { status: 400 });
  if (due && Number.isNaN(due.getTime())) return NextResponse.json({ error: "Неверная дата окончания" }, { status: 400 });
  try {
    const result = await applyDates({
      user: session.user,
      taskId: id,
      startsAt: starts,
      dueAt: due,
      note: body?.note ? String(body.note) : "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

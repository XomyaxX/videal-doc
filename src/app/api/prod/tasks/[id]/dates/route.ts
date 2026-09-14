import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { applyDates } from "@/lib/prod-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const dueRaw = body?.dueAt;
  const due =
    dueRaw === null || dueRaw === ""
      ? null
      : dueRaw
        ? new Date(String(dueRaw) + (String(dueRaw).length === 10 ? "T12:00:00+06:00" : ""))
        : undefined;
  if (due && Number.isNaN(due.getTime())) return NextResponse.json({ error: "Неверная дата" }, { status: 400 });
  try {
    const result = await applyDates({
      user: session.user,
      taskId: id,
      dueAt: due,
      note: body?.note ? String(body.note) : "",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

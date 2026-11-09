import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canWriteOff, WriteOffError } from "@/lib/writeoff";
import { cancelWriteOffSheet } from "@/lib/writeoff-server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!canWriteOff(session.user)) return NextResponse.json({ error: "Нет права" }, { status: 403 });
  const { id } = await ctx.params;
  try {
    await cancelWriteOffSheet(id, session.user.id);
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    if (e instanceof WriteOffError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: "Не удалось отменить" }, { status: 500 });
  }
}

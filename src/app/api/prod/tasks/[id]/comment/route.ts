import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { addTaskComment } from "@/lib/prod-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  try {
    await addTaskComment({
      user: session.user,
      taskId: id,
      body: String(body?.body || body?.comment || ""),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ошибка";
    const status = msg === "Нет права" || msg === "Нет права комментировать" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

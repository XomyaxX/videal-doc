import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { hideProdTask, restoreProdTask } from "@/lib/prod-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  try {
    if (action === "hide") await hideProdTask({ user: session.user, taskId: id });
    else if (action === "restore") await restoreProdTask({ user: session.user, taskId: id });
    else return NextResponse.json({ error: "Нужно hide или restore" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

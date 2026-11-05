import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canWriteOff, WriteOffError } from "@/lib/writeoff";
import { getWriteOffSheet, updateWriteOffSheet } from "@/lib/writeoff-server";

async function gate() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Нужно войти" }, { status: 401 }) };
  if (!canWriteOff(session.user)) return { error: NextResponse.json({ error: "Нет права" }, { status: 403 }) };
  return { session };
}

function fail(e: unknown) {
  if (e instanceof WriteOffError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Не удалось выполнить" }, { status: 500 });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await gate();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const sheet = await getWriteOffSheet(id);
  if (!sheet) return NextResponse.json({ error: "Нет акта" }, { status: 404 });
  return NextResponse.json({ sheet });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await gate();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const sheet = await updateWriteOffSheet(id, auth.session.user.id, body);
    return NextResponse.json({ ok: true, sheet });
  } catch (e) {
    return fail(e);
  }
}

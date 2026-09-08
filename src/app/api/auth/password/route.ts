import { NextRequest, NextResponse } from "next/server";
import { changePassword, getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const result = await changePassword(
    session.user.id,
    String(body?.current || ""),
    String(body?.next || ""),
    session.token,
  );
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  await audit({ userId: session.user.id, action: "password.change", entity: "user", entityId: session.user.id });
  return NextResponse.json({ ok: true });
}

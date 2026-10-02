import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { audit, auditRequestIp } from "@/lib/audit";
import { clearGateBg, gateBgMeta, saveGateBg } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function allowed() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) return null;
  return session;
}

export async function GET() {
  if (!(await allowed())) return NextResponse.json({ error: "Нет права" }, { status: 403 });
  const media = await gateBgMeta();
  return NextResponse.json({
    name: media?.name || "",
    mime: media?.mime || "",
    kind: media?.kind || "",
    v: media?.v || 0,
  });
}

export async function POST(req: NextRequest) {
  const session = await allowed();
  if (!session) return NextResponse.json({ error: "Нет права" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
  }
  const saved = await saveGateBg(file);
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
  await audit({
    userId: session.user.id,
    action: "gate.bg",
    entity: "appSettings",
    entityId: "default",
    details: saved.name,
    ip: auditRequestIp(req),
  });
  const media = await gateBgMeta();
  return NextResponse.json({ ok: true, name: saved.name, mime: saved.mime, kind: saved.kind, v: media?.v || Date.now() });
}

export async function DELETE(req: NextRequest) {
  const session = await allowed();
  if (!session) return NextResponse.json({ error: "Нет права" }, { status: 403 });
  await clearGateBg();
  await audit({
    userId: session.user.id,
    action: "gate.bg.clear",
    entity: "appSettings",
    entityId: "default",
    ip: auditRequestIp(req),
  });
  return NextResponse.json({ ok: true });
}

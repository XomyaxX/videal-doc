import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint || "");
  const p256dh = String(body?.keys?.p256dh || "");
  const auth = String(body?.keys?.auth || "");
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "Нет подписки" }, { status: 400 });
  }
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);
  await prisma.webPushSub.upsert({
    where: { endpoint },
    create: { userId: session.user.id, endpoint, p256dh, auth, userAgent: ua },
    update: { userId: session.user.id, p256dh, auth, userAgent: ua, lastError: "" },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = String(body?.endpoint || "");
  if (endpoint) {
    await prisma.webPushSub.deleteMany({ where: { userId: session.user.id, endpoint } });
  } else {
    await prisma.webPushSub.deleteMany({ where: { userId: session.user.id } });
  }
  return NextResponse.json({ ok: true });
}

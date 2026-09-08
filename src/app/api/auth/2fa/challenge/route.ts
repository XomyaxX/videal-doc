import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { needs2fa } from "@/lib/privileges";
import { originHost, requestOrigin } from "@/lib/origin";
import { rateLimit } from "@/lib/login-guard";

const TTL_MS = 2 * 60 * 1000;

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`2fa-ch:${ip}`, 30, 15 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много попыток" }, { status: 429 });
  }
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (!needs2fa(session.user) || !session.user.totpEnabled) {
    return NextResponse.json({ error: "Для этой учётки код не нужен" }, { status: 400 });
  }
  if (session.user.totpOk) return NextResponse.json({ error: "Уже подтверждено" }, { status: 400 });

  const row = await prisma.session.findUnique({ where: { token: session.token }, select: { id: true } });
  if (!row) return NextResponse.json({ error: "Нет сессии" }, { status: 401 });

  const now = new Date();
  const existing = await prisma.authChallenge.findFirst({
    where: {
      sessionId: row.id,
      kind: "login",
      consumedAt: null,
      deniedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
  });
  const origin = requestOrigin(req);
  const challenge =
    existing ??
    (await prisma.authChallenge.create({
      data: {
        userId: session.user.id,
        sessionId: row.id,
        kind: "login",
        host: originHost(origin) || "www.videal-doc.ru",
        expiresAt: new Date(now.getTime() + TTL_MS),
      },
    }));

  const url = `${origin}/login/2fa/scan?c=${challenge.id}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 240 });
  return NextResponse.json({
    id: challenge.id,
    qr,
    url,
    expiresAt: challenge.expiresAt.toISOString(),
  });
}

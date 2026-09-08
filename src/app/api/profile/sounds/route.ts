import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const soundAlerts = Boolean(body?.soundAlerts);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { soundAlerts },
  });
  return NextResponse.json({ ok: true, soundAlerts });
}

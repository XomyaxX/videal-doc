import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeePipelineKind } from "@/lib/prod-kinds";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нет права" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const ep = await prisma.episode.findUnique({
    where: { id },
    select: { id: true, show: { select: { pipelineKind: true } } },
  });
  if (!ep) return NextResponse.json({ error: "Нет серии" }, { status: 404 });
  if (!canSeePipelineKind(session.user, ep.show.pipelineKind)) {
    return NextResponse.json({ error: "Этот пайплайн не вашего отдела" }, { status: 403 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { currentEpisodeId: ep.id },
  });
  return NextResponse.json({ ok: true });
}

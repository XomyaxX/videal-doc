import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { canLeadProd } from "@/lib/prod";
import { createJob, jobListWhere, jobProgress } from "@/lib/jobs";
import { fullName } from "@/lib/names";

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const rows = await prisma.job.findMany({
    where: { status: { not: "archived" }, ...jobListWhere(session.user) },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      episode: { select: { code: true, name: true } },
      members: { select: { userId: true } },
      tasks: { where: { deletedAt: null }, select: { stage: true, status: true, complexity: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    rows: rows.map((j) => ({
      id: j.id,
      title: j.title,
      description: j.description,
      status: j.status,
      episode: j.episode,
      authorName: fullName(j.author),
      memberCount: j.members.length,
      progress: jobProgress(j.tasks),
      startsAt: j.startsAt,
      dueAt: j.dueAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  try {
    const job = await createJob({
      user: session.user,
      title: String(body?.title || ""),
      description: String(body?.description || ""),
      episodeId: body?.episodeId || null,
      startsAt: body?.startsAt ? new Date(body.startsAt) : null,
      dueAt: body?.dueAt ? new Date(body.dueAt) : null,
      memberIds: Array.isArray(body?.memberIds) ? body.memberIds.map(String) : [],
    });
    return NextResponse.json({ id: job.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

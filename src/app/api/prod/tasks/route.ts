import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { createProdTask, taskInclude, taskListWhere } from "@/lib/prod-server";
import { canLeadProd } from "@/lib/prod";
import { attachLibraryToTask } from "@/lib/library";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const raw = req.nextUrl.searchParams.get("scope");
  const scope = raw === "all" || raw === "dept" || raw === "mine" ? raw : canLeadProd(session.user) ? "dept" : "mine";
  const status = req.nextUrl.searchParams.get("status");
  const tasks = await prisma.task.findMany({
    where: {
      ...taskListWhere(session.user, scope),
      ...(status ? { status } : {}),
    },
    include: taskInclude,
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    take: 200,
  });
  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Создавать задачи может только руководство" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const kind = String(body?.kind || "");
  if (kind !== "shot" && kind !== "scene" && kind !== "asset" && kind !== "episode" && kind !== "job") {
    return NextResponse.json({ error: "Укажите тип задачи" }, { status: 400 });
  }
  const parseDay = (v: unknown) => {
    const s = String(v || "");
    if (!s) return null;
    const d = new Date(s.length === 10 ? `${s}T12:00:00+06:00` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  try {
    const task = await createProdTask({
      user: session.user,
      kind,
      stage: String(body?.stage || (kind === "job" ? "task" : "")),
      title: body?.title ? String(body.title) : undefined,
      skillCodes: Array.isArray(body?.skillCodes) ? body.skillCodes.map(String) : undefined,
      episodeId: body?.episodeId || undefined,
      sceneId: body?.sceneId || undefined,
      shotId: body?.shotId || undefined,
      assetId: body?.assetId || undefined,
      newShotCode: body?.newShotCode || undefined,
      newAssetName: body?.newAssetName || undefined,
      newAssetKind: body?.newAssetKind || undefined,
      assigneeId: body?.assigneeId || null,
      startsAt: parseDay(body?.startsAt),
      dueAt: parseDay(body?.dueAt),
      comment: body?.comment || "",
      complexity: body?.complexity ? Number(body.complexity) : undefined,
    });
    const libraryIds = Array.isArray(body?.libraryIds) ? body.libraryIds.map(String) : [];
    if (libraryIds.length) await attachLibraryToTask(task.id, libraryIds);
    return NextResponse.json({ id: task.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { canLeadProd } from "@/lib/prod";
import { taskListWhere, taskTitle } from "@/lib/prod-server";
import { officeYmd } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const raw = req.nextUrl.searchParams.get("scope");
  const scope = raw === "all" || raw === "dept" || raw === "mine" ? raw : "mine";
  const effective = canLeadProd(session.user) ? scope : "mine";
  const fromD = from ? new Date(from) : new Date();
  const toD = to ? new Date(to) : new Date();
  const tasks = await prisma.task.findMany({
    where: {
      ...taskListWhere(session.user, effective),
      startsAt: { not: null },
      dueAt: { not: null },
      AND: [{ startsAt: { lte: toD } }, { dueAt: { gte: fromD } }],
    },
    include: {
      assignee: true,
      shot: true,
      scene: true,
      asset: true,
    },
    take: 300,
  });
  return NextResponse.json({
    bars: tasks.map((t) => ({
      id: t.id,
      title: `${taskTitle(t)} · ${t.stage}`,
      href: `/prod/tasks/${t.id}`,
      startYmd: officeYmd(t.startsAt!),
      endYmd: officeYmd(t.dueAt!),
      stage: t.stage,
      status: t.status,
      mine: t.assigneeId === session.user.id,
    })),
  });
}

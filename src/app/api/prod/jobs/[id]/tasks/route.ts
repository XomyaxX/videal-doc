import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canLeadProd } from "@/lib/prod";
import { createJobTask } from "@/lib/jobs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  try {
    const task = await createJobTask({
      user: session.user,
      jobId: id,
      title: String(body?.title || ""),
      complexity: Number(body?.complexity) || 3,
      skillIds: Array.isArray(body?.skillIds) ? body.skillIds.map(String) : [],
      dueAt: body?.dueAt ? new Date(body.dueAt) : null,
      comment: String(body?.comment || ""),
      assigneeId: body?.assigneeId ? String(body.assigneeId) : null,
    });
    return NextResponse.json({ id: task.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

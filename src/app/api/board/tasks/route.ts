import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardApiGuard, boardErrorResponse, createTask } from "@/lib/work-board";

const schema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().max(4000).optional(),
  departmentId: z.string().min(1).nullable().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Укажите название задачи" }, { status: 400 });
  }
  try {
    const snapshot = await createTask(guard.userId, parsed.data, guard.ip);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

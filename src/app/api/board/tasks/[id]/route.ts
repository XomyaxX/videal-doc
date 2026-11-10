import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardApiGuard, boardErrorResponse, deleteTask, updateTask } from "@/lib/work-board";

const schema = z
  .object({
    version: z.number().int().positive(),
    title: z.string().max(200).optional(),
    body: z.string().max(4000).optional(),
    status: z.enum(["todo", "wip", "done"]).optional(),
    assigneeId: z.string().min(1).nullable().optional(),
    departmentId: z.string().min(1).nullable().optional(),
    dueOn: z.string().max(10).optional(),
    prodTaskId: z.string().min(1).nullable().optional(),
    posX: z.number().finite().optional(),
    posY: z.number().finite().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.body !== undefined ||
      value.status !== undefined ||
      value.assigneeId !== undefined ||
      value.departmentId !== undefined ||
      value.dueOn !== undefined ||
      value.prodTaskId !== undefined ||
      value.posX !== undefined ||
      value.posY !== undefined,
    { message: "empty" },
  );

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  const { id } = await ctx.params;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля задачи" }, { status: 400 });
  }
  try {
    const snapshot = await updateTask(guard.userId, id, parsed.data, guard.ip);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  const { id } = await ctx.params;
  try {
    const snapshot = await deleteTask(guard.userId, id, guard.ip);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

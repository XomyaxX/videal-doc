import { NextRequest, NextResponse } from "next/server";
import { boardApiGuard, boardErrorResponse, deleteEdge } from "@/lib/work-board";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  const { id } = await ctx.params;
  try {
    const snapshot = await deleteEdge(guard.userId, id, guard.ip);
    return NextResponse.json({ snapshot });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

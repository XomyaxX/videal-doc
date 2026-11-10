import { NextRequest, NextResponse } from "next/server";
import { boardApiGuard, boardErrorResponse, loadSnapshot } from "@/lib/work-board";

export async function GET(req: NextRequest) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  try {
    const snapshot = await loadSnapshot();
    return NextResponse.json({ snapshot });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

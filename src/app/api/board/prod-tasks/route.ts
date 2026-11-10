import { NextRequest, NextResponse } from "next/server";
import { boardApiGuard, boardErrorResponse, searchProdTasks } from "@/lib/work-board";

export async function GET(req: NextRequest) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  try {
    const tasks = await searchProdTasks(req.nextUrl.searchParams.get("q") ?? "");
    return NextResponse.json({ tasks });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

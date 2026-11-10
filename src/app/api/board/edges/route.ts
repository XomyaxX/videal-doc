import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { boardApiGuard, boardErrorResponse, createEdge } from "@/lib/work-board";

const schema = z.object({
  sourceId: z.string().min(1),
  targetId: z.string().min(1),
  kind: z.enum(["blocks", "depends", "sequence"]),
});

export async function POST(req: NextRequest) {
  const guard = await boardApiGuard(req);
  if (!guard.ok) return guard.res;
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте связь" }, { status: 400 });
  }
  try {
    const snapshot = await createEdge(
      guard.userId,
      parsed.data.sourceId,
      parsed.data.targetId,
      parsed.data.kind,
      guard.ip,
    );
    return NextResponse.json({ snapshot });
  } catch (error) {
    return boardErrorResponse(error);
  }
}

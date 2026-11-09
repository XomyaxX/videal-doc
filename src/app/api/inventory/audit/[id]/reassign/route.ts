import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { ReassignError, reassignInventoryItem } from "@/lib/inventory-statement-server";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await reassignInventoryItem({
      auditId: id,
      inventoryItemId: String(body.inventoryItemId || ""),
      toUserId: String(body.toUserId || ""),
      actorId: session.user.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ReassignError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

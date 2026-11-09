import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { InventoryRoundError, startInventoryRound } from "@/lib/inventory-round-server";

export async function POST() {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  try {
    const row = await startInventoryRound(session.user.id);
    return NextResponse.json({ id: row.id, number: row.number });
  } catch (e) {
    if (e instanceof InventoryRoundError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

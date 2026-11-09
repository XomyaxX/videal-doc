import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { searchInventoryItems } from "@/lib/inventory-statement-server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "inventory.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const items = await searchInventoryItems(req.nextUrl.searchParams.get("q") || "");
  return NextResponse.json({ items });
}

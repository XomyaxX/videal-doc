import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { pushStatus } from "@/lib/push";

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  return NextResponse.json(await pushStatus());
}

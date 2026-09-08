import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { readPublicUrl } from "@/lib/public-url";

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const url = await readPublicUrl();
  return NextResponse.json({ url });
}

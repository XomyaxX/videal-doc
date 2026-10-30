import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { QR_ONLY_ERROR } from "@/lib/presence";

export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  return NextResponse.json({ error: QR_ONLY_ERROR }, { status: 403 });
}

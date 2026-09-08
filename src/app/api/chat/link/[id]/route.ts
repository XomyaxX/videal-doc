import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Привязка ключа больше не нужна" }, { status: 410 });
}

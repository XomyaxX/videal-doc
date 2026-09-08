import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ error: "Ключ чата только у админа. Откройте Чаты." }, { status: 410 });
}

export async function POST() {
  return NextResponse.json({ error: "Ключ чата только у админа. Откройте Чаты." }, { status: 410 });
}

import { NextResponse } from "next/server";
import { stopIdentify } from "@/lib/office-lan";

export async function GET() {
  await stopIdentify();
  return NextResponse.json({ identify: null });
}

export async function POST() {
  await stopIdentify();
  return NextResponse.json({ identify: null });
}

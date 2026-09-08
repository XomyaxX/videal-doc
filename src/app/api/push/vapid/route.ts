import { NextResponse } from "next/server";
import { vapidPublicKey } from "@/lib/push";

export async function GET() {
  return NextResponse.json({ publicKey: vapidPublicKey() });
}

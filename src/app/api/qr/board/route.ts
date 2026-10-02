import { NextRequest, NextResponse } from "next/server";
import { gateScreenPayload } from "@/lib/gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json(await gateScreenPayload(req), { headers: { "Cache-Control": "no-store" } });
}

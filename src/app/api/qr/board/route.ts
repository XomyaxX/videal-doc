import { NextRequest, NextResponse } from "next/server";
import { gateScreenAllowed, gateScreenForbidden, gateScreenPayload } from "@/lib/gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await gateScreenAllowed(req))) return gateScreenForbidden();
  return NextResponse.json(await gateScreenPayload(req), { headers: { "Cache-Control": "no-store" } });
}

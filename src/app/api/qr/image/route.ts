import { NextRequest, NextResponse } from "next/server";
import { gatePublicOrigin, gateQrPng, gateScreenAllowed, gateScreenForbidden, openGateToken } from "@/lib/gate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await gateScreenAllowed(req))) return gateScreenForbidden();
  const gate = await openGateToken();
  const url = `${gatePublicOrigin(req)}/arrive?t=${encodeURIComponent(gate.token)}`;
  const png = await gateQrPng(url);
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}

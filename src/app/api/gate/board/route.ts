import { NextRequest, NextResponse } from "next/server";
import { gateKeyOk, gateScreenPayload } from "@/lib/gate";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("k") || "";
  if (!(await gateKeyOk(key))) return NextResponse.json({ error: "Нет доступа к экрану" }, { status: 403 });
  return NextResponse.json(await gateScreenPayload(req), { headers: { "Cache-Control": "no-store" } });
}

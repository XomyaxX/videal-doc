import { NextRequest, NextResponse } from "next/server";
import { isOfficeLanIp, requestLanIp } from "@/lib/presence";

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  res.headers.set("Access-Control-Allow-Private-Network", "true");
  return res;
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const ip = requestLanIp(req);
  return cors(
    NextResponse.json({
      ok: true,
      ip,
      lan: isOfficeLanIp(ip) ? ip : "",
    }),
  );
}

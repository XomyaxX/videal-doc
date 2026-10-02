import { NextRequest, NextResponse } from "next/server";
import { isOfficeLanIp, requestLanIp } from "@/lib/presence";

const ORIGINS = new Set([
  "https://www.videal-doc.ru",
  "https://videal-doc.ru",
  "http://192.168.1.51",
  "https://192.168.1.51",
]);

function originOk(origin: string) {
  if (ORIGINS.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

function cors(req: NextRequest, res: NextResponse) {
  const origin = req.headers.get("origin") || "";
  if (originOk(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.set("Access-Control-Allow-Private-Network", "true");
  }
  return res;
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  if (origin && !originOk(origin)) return new NextResponse(null, { status: 403 });
  return cors(req, new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") || "";
  if (origin && !originOk(origin)) return new NextResponse(null, { status: 403 });
  const ip = requestLanIp(req);
  const lan = isOfficeLanIp(ip) ? ip : "";
  return cors(req, NextResponse.json({ ok: true, lan }));
}

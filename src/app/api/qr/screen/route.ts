import { stat } from "fs/promises";
import { NextRequest } from "next/server";
import { SCREEN_CACHE, gateBgResponse, gateScreenFiles } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const files = await gateScreenFiles();
  if (req.nextUrl.searchParams.get("probe") === "1") {
    return new Response(null, { status: files?.videoAbs ? 204 : 404, headers: { "Cache-Control": SCREEN_CACHE } });
  }
  if (!files?.videoAbs) return new Response("Фон не загружен", { status: 404 });
  const st = await stat(files.videoAbs);
  return gateBgResponse(files.videoAbs, "video/mp4", st.size, req.headers.get("range"), SCREEN_CACHE);
}

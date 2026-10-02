import { stat } from "fs/promises";
import type { NextRequest } from "next/server";
import { gateScreenAllowed, gateScreenForbidden } from "@/lib/gate";
import { SCREEN_CACHE, gateBgResponse, gateScreenFiles } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await gateScreenAllowed(req))) return gateScreenForbidden();
  const files = await gateScreenFiles();
  if (!files?.posterAbs) return new Response("Фон не загружен", { status: 404 });
  const st = await stat(files.posterAbs);
  return gateBgResponse(files.posterAbs, "image/jpeg", st.size, null, SCREEN_CACHE);
}

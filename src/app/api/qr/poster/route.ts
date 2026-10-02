import { stat } from "fs/promises";
import { SCREEN_CACHE, gateBgResponse, gateScreenFiles } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const files = await gateScreenFiles();
  if (!files?.posterAbs) return new Response("Фон не загружен", { status: 404 });
  const st = await stat(files.posterAbs);
  return gateBgResponse(files.posterAbs, "image/jpeg", st.size, null, SCREEN_CACHE);
}

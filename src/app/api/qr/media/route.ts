import { NextRequest } from "next/server";
import { gateScreenAllowed, gateScreenForbidden } from "@/lib/gate";
import { gateBgMeta, gateBgResponse } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await gateScreenAllowed(req))) return gateScreenForbidden();
  const media = await gateBgMeta();
  if (!media) return new Response("Фон не загружен", { status: 404 });
  return gateBgResponse(media.abs, media.mime, media.size, req.headers.get("range"));
}

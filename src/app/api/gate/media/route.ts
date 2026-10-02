import { NextRequest } from "next/server";
import { gateKeyOk } from "@/lib/gate";
import { gateBgMeta, gateBgResponse } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("k") || "";
  if (!(await gateKeyOk(key))) {
    return new Response("Нет доступа к экрану", { status: 403 });
  }
  const media = await gateBgMeta();
  if (!media) return new Response("Фон не загружен", { status: 404 });
  return gateBgResponse(media.abs, media.mime, media.size, req.headers.get("range"));
}

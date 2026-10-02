import { NextRequest } from "next/server";
import { gateBgMeta, gateBgResponse } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const media = await gateBgMeta();
  if (!media) return new Response("Фон не загружен", { status: 404 });
  return gateBgResponse(media.abs, media.mime, media.size, req.headers.get("range"));
}

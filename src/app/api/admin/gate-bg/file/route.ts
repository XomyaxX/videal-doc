import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { gateBgMeta, gateBgResponse } from "@/lib/gate-bg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const media = await gateBgMeta();
  if (!media) return new Response("Фон не загружен", { status: 404 });
  return gateBgResponse(media.abs, media.mime, media.size, req.headers.get("range"));
}

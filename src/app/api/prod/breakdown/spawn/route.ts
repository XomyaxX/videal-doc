import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canLeadProd } from "@/lib/prod";
import { spawnBreakdown } from "@/lib/breakdown";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Заводить этапы может только руководство" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  try {
    const result = await spawnBreakdown({
      user: session.user,
      episodeId: String(body?.episodeId || ""),
      sceneId: body?.sceneId ? String(body.sceneId) : undefined,
      shotId: body?.shotId ? String(body.shotId) : undefined,
      assetId: body?.assetId ? String(body.assetId) : undefined,
      includePreprod: Boolean(body?.includePreprod),
      includeScenes: Boolean(body?.includeScenes),
      includeShots: Boolean(body?.includeShots),
      includeAssets: Boolean(body?.includeAssets),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

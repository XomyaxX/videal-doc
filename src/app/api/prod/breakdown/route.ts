import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canLeadProd } from "@/lib/prod";
import {
  addShots,
  createAssetRow,
  createEpisode,
  createScene,
  patchAssetKind,
  patchScene,
  patchShot,
  removeAsset,
  removeEmptyScene,
  removeEmptyShot,
  reorderBreakdown,
} from "@/lib/breakdown";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canLeadProd(session.user)) {
    return NextResponse.json({ error: "Собирать серию может только руководство" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  try {
    if (action === "createEpisode") {
      const episode = await createEpisode({
        user: session.user,
        showId: body?.showId ? String(body.showId) : undefined,
        showName: body?.showName ? String(body.showName) : undefined,
        code: String(body?.code || ""),
        name: String(body?.name || ""),
      });
      return NextResponse.json({ ok: true, episodeId: episode.id });
    }
    if (action === "createScene") {
      const result = await createScene({
        user: session.user,
        episodeId: String(body?.episodeId || ""),
        title: String(body?.title || ""),
        locationNote: body?.locationNote ? String(body.locationNote) : "",
        charactersNote: body?.charactersNote ? String(body.charactersNote) : "",
        shotCount: body?.shotCount != null ? Number(body.shotCount) : 6,
        spawn: Boolean(body?.spawn),
      });
      return NextResponse.json({
        ok: true,
        sceneId: result.scene.id,
        shots: result.shots.length,
        spawned: result.spawned,
      });
    }
    if (action === "addShots") {
      const result = await addShots({
        user: session.user,
        sceneId: String(body?.sceneId || ""),
        count: Number(body?.count || 0),
        spawn: Boolean(body?.spawn),
      });
      return NextResponse.json({ ok: true, shots: result.shots.length, spawned: result.spawned });
    }
    if (action === "createAsset") {
      const result = await createAssetRow({
        user: session.user,
        episodeId: String(body?.episodeId || ""),
        kind: String(body?.kind || "prop"),
        name: String(body?.name || ""),
        spawn: Boolean(body?.spawn),
      });
      return NextResponse.json({ ok: true, assetId: result.asset.id, spawned: result.spawned });
    }
    if (action === "patchAsset") {
      await patchAssetKind({
        user: session.user,
        assetId: String(body?.assetId || ""),
        kind: String(body?.kind || "prop"),
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "patchScene") {
      await patchScene({
        user: session.user,
        sceneId: String(body?.sceneId || ""),
        title: body?.title !== undefined ? String(body.title) : undefined,
        locationNote: body?.locationNote !== undefined ? String(body.locationNote) : undefined,
        charactersNote: body?.charactersNote !== undefined ? String(body.charactersNote) : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "patchShot") {
      await patchShot({
        user: session.user,
        shotId: String(body?.shotId || ""),
        location: body?.location !== undefined ? String(body.location) : undefined,
        description: body?.description !== undefined ? String(body.description) : undefined,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "removeShot") {
      await removeEmptyShot({ user: session.user, shotId: String(body?.shotId || "") });
      return NextResponse.json({ ok: true });
    }
    if (action === "removeScene") {
      await removeEmptyScene({ user: session.user, sceneId: String(body?.sceneId || "") });
      return NextResponse.json({ ok: true });
    }
    if (action === "removeAsset") {
      await removeAsset({ user: session.user, assetId: String(body?.assetId || "") });
      return NextResponse.json({ ok: true });
    }
    if (action === "reorder") {
      await reorderBreakdown({
        user: session.user,
        target: String(body?.target || ""),
        id: String(body?.id || ""),
        to: Number(body?.to),
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

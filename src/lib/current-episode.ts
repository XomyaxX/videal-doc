import { prisma } from "./prisma";
import { userPipelineKinds } from "./prod-kinds";
import type { SessionUser } from "./types";

export async function currentEpisodeId(user?: SessionUser | null): Promise<string | null> {
  const kinds = user ? userPipelineKinds(user) : (["e02", "ai"] as const);
  const kindFilter = kinds.length ? { show: { pipelineKind: { in: [...kinds] } } } : { id: "__none__" };

  if (user) {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { currentEpisodeId: true } });
    if (row?.currentEpisodeId) {
      const mine = await prisma.episode.findFirst({
        where: { id: row.currentEpisodeId, ...kindFilter },
        select: { id: true },
      });
      if (mine) return mine.id;
    }
  }

  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  if (s?.currentEpisodeId) {
    const ok = await prisma.episode.findFirst({
      where: { id: s.currentEpisodeId, ...kindFilter },
      select: { id: true },
    });
    if (ok) return ok.id;
  }

  const first = await prisma.episode.findFirst({
    where: kindFilter,
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

export function taskScopeKey(opts: {
  stage: string;
  shotId?: string | null;
  assetId?: string | null;
  sceneId?: string | null;
  episodeId?: string | null;
}) {
  if (opts.shotId) return `shot:${opts.shotId}:${opts.stage}`;
  if (opts.assetId) return `asset:${opts.assetId}:${opts.stage}`;
  if (opts.sceneId) return `scene:${opts.sceneId}:${opts.stage}`;
  if (opts.episodeId) return `episode:${opts.episodeId}:${opts.stage}`;
  return "";
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canSeeScores } from "@/lib/prod-server";
import { fullName } from "@/lib/names";
import { USER_SAFE_ORG_SELECT } from "@/lib/user-public";

export async function GET() {
  const session = await getSession();
  if (!session || !canSeeScores(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const events = await prisma.productionScoreEvent.findMany({
    include: { user: { select: USER_SAFE_ORG_SELECT } },
  });
  const map = new Map<
    string,
    { userId: string; name: string; dept: string; points: number }
  >();
  for (const e of events) {
    const cur = map.get(e.userId) || {
      userId: e.userId,
      name: fullName(e.user),
      dept: e.user.department?.name || "",
      points: 0,
    };
    cur.points += e.points;
    map.set(e.userId, cur);
  }
  const rows = [...map.values()].sort((a, b) => b.points - a.points);
  return NextResponse.json({ rows });
}

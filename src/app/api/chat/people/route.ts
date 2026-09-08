import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lastSeenMap, toPerson } from "@/lib/chat-server";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const rows = await prisma.user.findMany({
    where: {
      deletedAt: null,
      status: "active",
      id: { not: session.user.id },
      ...(q
        ? {
            OR: [
              { lastName: { contains: q } },
              { firstName: { contains: q } },
              { middleName: { contains: q } },
              { login: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      photoFileId: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 80,
  });
  const seen = await lastSeenMap(rows.map((r) => r.id));
  return NextResponse.json({
    people: rows.map((r) => toPerson(r, { hasIdentity: true, lastSeenAt: seen.get(r.id) || null })),
  });
}

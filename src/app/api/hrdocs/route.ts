import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { hrType } from "@/lib/hrdocs";
import { isHrAddressee } from "@/lib/leaders";
import { archiveHrLetter } from "@/lib/archive";
import { USER_SAFE_SELECT } from "@/lib/user-public";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "hrdocs.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const inbox = req.nextUrl.searchParams.get("inbox") === "1";
  const rows = await prisma.hrRequest.findMany({
    where: inbox
      ? { managerId: session.user.id, status: { in: ["review", "accepted", "rejected", "rework"] } }
      : { authorId: session.user.id },
    include: { author: { select: USER_SAFE_SELECT }, manager: { select: USER_SAFE_SELECT } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "hrdocs.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const type = String(body?.type || "");
  const spec = hrType(type);
  if (!spec) return NextResponse.json({ error: "Выберите тип заявления" }, { status: 400 });
  const managerId = String(body?.managerId || "");
  const mgr = await prisma.user.findFirst({
    where: { id: managerId, deletedAt: null, status: "active" },
    include: { position: true, role: true },
  });
  if (!mgr || !isHrAddressee(mgr)) {
    return NextResponse.json({ error: "Выберите руководителя из списка" }, { status: 400 });
  }
  const payload = body?.payload && typeof body.payload === "object" ? body.payload : {};
  const number = await nextNumber("hr", "ЗЯ");
  const created = await prisma.hrRequest.create({
    data: {
      number,
      type,
      title: spec.title,
      authorId: session.user.id,
      managerId,
      status: "draft",
      payloadJson: JSON.stringify(payload),
    },
  });
  await archiveHrLetter(created.id);
  return NextResponse.json({ id: created.id });
}

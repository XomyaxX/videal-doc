import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "catalogs.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json();
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Название" }, { status: 400 });
  if (body.kind === "department") {
    const row = await prisma.department.create({ data: { name } });
    const { syncOfficialChats } = await import("@/lib/chat-official");
    await syncOfficialChats(true);
    return NextResponse.json(row);
  }
  if (body.kind === "position") {
    const row = await prisma.position.create({ data: { name } });
    return NextResponse.json(row);
  }
  return NextResponse.json({ error: "kind" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "catalogs.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json();
  const id = String(body.id || "");
  if (body.kind === "department") {
    await prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
    const { syncOfficialChats } = await import("@/lib/chat-official");
    await syncOfficialChats(true);
  }
  if (body.kind === "position") await prisma.position.update({ where: { id }, data: { deletedAt: new Date() } });
  return NextResponse.json({ ok: true });
}

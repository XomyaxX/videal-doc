import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sealPayload, sealTitle } from "@/lib/chat-server";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const memberIds = Array.isArray(body?.memberIds) ? body.memberIds.map(String).filter(Boolean) : [];
  const unique = [...new Set([session.user.id, ...memberIds])];
  if (unique.length < 2) return NextResponse.json({ error: "В группе нужны люди" }, { status: 400 });
  if (unique.length > 80) return NextResponse.json({ error: "Слишком много участников" }, { status: 400 });
  const people = await prisma.user.findMany({
    where: { id: { in: unique }, deletedAt: null, status: "active" },
    select: { id: true },
  });
  if (people.length !== unique.length) return NextResponse.json({ error: "Кого-то нет среди сотрудников" }, { status: 400 });
  const title = String(body?.title || "").trim().slice(0, 120);
  if (!title) return NextResponse.json({ error: "Нет названия" }, { status: 400 });
  const enc = await sealTitle(title);
  const avatarFileId = String(body?.avatarFileId || "").slice(0, 80);

  const chat = await prisma.chat.create({
    data: {
      kind: "group",
      keyGen: 0,
      titleCipher: enc.ciphertext,
      titleIv: enc.iv,
      avatarFileId,
      members: {
        create: unique.map((userId) => ({
          userId,
          role: userId === session.user.id ? "owner" : "member",
        })),
      },
    },
  });
  const sys = await sealPayload({ v: 1, t: "system", system: { kind: "create" } });
  await prisma.chatMessage.create({
    data: {
      chatId: chat.id,
      authorId: session.user.id,
      type: "system",
      ciphertext: sys.ciphertext,
      iv: sys.iv,
    },
  });
  await audit({ userId: session.user.id, action: "chat.group", entity: "chat", entityId: chat.id, details: `n=${unique.length}` });
  return NextResponse.json({ id: chat.id });
}

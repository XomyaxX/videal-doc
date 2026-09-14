import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openPayload, requireMember } from "@/lib/chat-server";
import { extractUrls, type MediaItem, type MediaTab } from "@/lib/chat-media";
import { fullName } from "@/lib/names";

const PAGE = 40;

function isTab(s: string): s is MediaTab {
  return s === "media" || s === "files" || s === "links" || s === "voices";
}

function parseCursor(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const member = await requireMember(session.user, id);
  if (!member) return NextResponse.json({ error: "Нет чата" }, { status: 404 });
  const tabRaw = String(req.nextUrl.searchParams.get("tab") || "media");
  const tab: MediaTab = isTab(tabRaw) ? tabRaw : "media";
  const cursor = parseCursor(req.nextUrl.searchParams.get("cursor") || "");

  if (tab === "links") {
    const items: MediaItem[] = [];
    let scanAt = cursor;
    let more = true;
    let scanned = 0;
    while (items.length < PAGE && more && scanned < 400) {
      const rows = await prisma.chatMessage.findMany({
        where: {
          chatId: id,
          deletedAt: null,
          type: "text",
          ...(scanAt ? { createdAt: { lt: scanAt } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          author: { select: { lastName: true, firstName: true, middleName: true } },
        },
      });
      if (!rows.length) {
        more = false;
        break;
      }
      for (const m of rows) {
        scanned += 1;
        scanAt = m.createdAt;
        const payload = await openPayload(m.iv, m.ciphertext);
        const urls = extractUrls(payload?.text || "");
        const authorName = fullName(m.author);
        for (let i = 0; i < urls.length; i++) {
          items.push({
            id: `${m.id}:${i}`,
            tab: "links",
            messageId: m.id,
            createdAt: m.createdAt.toISOString(),
            authorName,
            url: urls[i],
            text: payload?.text || "",
          });
        }
        if (items.length >= PAGE) break;
      }
      if (rows.length < 50) more = false;
    }
    const nextCursor = more && scanAt ? scanAt.toISOString() : items.length >= PAGE ? items[items.length - 1].createdAt : null;
    return NextResponse.json({ items: items.slice(0, PAGE), nextCursor });
  }

  const mimeFilter =
    tab === "media"
      ? { OR: [{ mime: { startsWith: "image/" } }, { mime: { startsWith: "video/" } }] }
      : tab === "voices"
        ? {
            OR: [{ mime: { startsWith: "audio/" } }, { originalName: { startsWith: "voice." } }],
          }
        : {
            AND: [
              { NOT: { mime: { startsWith: "image/" } } },
              { NOT: { mime: { startsWith: "video/" } } },
              { NOT: { mime: { startsWith: "audio/" } } },
            ],
          };

  const blobs = await prisma.chatBlob.findMany({
    where: {
      chatId: id,
      messageId: { not: null },
      message: { deletedAt: null },
      ...(cursor ? { createdAt: { lt: cursor } } : {}),
      ...mimeFilter,
    },
    orderBy: { createdAt: "desc" },
    take: PAGE + 1,
    include: {
      message: {
        select: {
          id: true,
          type: true,
          createdAt: true,
          iv: true,
          ciphertext: true,
          author: { select: { lastName: true, firstName: true, middleName: true } },
        },
      },
    },
  });
  const extra = blobs.length > PAGE;
  const page = extra ? blobs.slice(0, PAGE) : blobs;
  const items: MediaItem[] = [];
  for (const b of page) {
    const msg = b.message;
    if (!msg) continue;
    const item: MediaItem = {
      id: b.id,
      tab,
      messageId: msg.id,
      createdAt: (msg.createdAt || b.createdAt).toISOString(),
      authorName: fullName(msg.author),
      blobId: b.id,
      mime: b.mime,
      name: b.originalName,
      size: b.size,
    };
    if (tab === "voices") {
      const payload = await openPayload(msg.iv, msg.ciphertext);
      item.durationMs = payload?.voice?.durationMs || 0;
      item.text = payload?.voice?.text || "";
    }
    items.push(item);
  }
  const nextCursor = extra ? page[page.length - 1]?.createdAt.toISOString() || null : null;
  return NextResponse.json({ items, nextCursor });
}

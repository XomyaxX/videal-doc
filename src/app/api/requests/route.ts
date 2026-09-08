import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { notify } from "@/lib/notify";
import { REQUEST_CATEGORIES } from "@/lib/requests";
import { USER_SAFE_SELECT } from "@/lib/user-public";

function itemsFromBody(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, i) => {
      const name = String(row?.name || "").trim();
      const qty = Math.max(1, Number(row?.qty) || 1);
      return {
        name,
        qty,
        unit: String(row?.unit || "шт").slice(0, 20),
        url: String(row?.url || "").trim().slice(0, 500),
        note: String(row?.note || "").trim().slice(0, 500),
        fileId: String(row?.fileId || ""),
        sortOrder: i,
      };
    })
    .filter((r) => r.name);
}

async function notifyAho(title: string, body: string, link: string) {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, status: "active", role: { code: "aho" } },
  });
  for (const u of users) await notify({ userId: u.id, title, body, link, urgency: "normal" });
}

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "requests.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const aho = userCan(session.user, "requests.aho");
  const rows = await prisma.purchaseRequest.findMany({
    where: aho ? {} : { authorId: session.user.id },
    include: { author: { select: USER_SAFE_SELECT }, items: { orderBy: { sortOrder: "asc" } }, fundRequest: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "requests.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const title = String(body?.title || "").trim();
  const category = String(body?.category || "other");
  if (!title) return NextResponse.json({ error: "Напишите, что нужно" }, { status: 400 });
  if (!REQUEST_CATEGORIES.some((c) => c.id === category)) {
    return NextResponse.json({ error: "Категория" }, { status: 400 });
  }
  const items = itemsFromBody(body?.items);
  if (items.length === 0) return NextResponse.json({ error: "Добавьте хотя бы одну позицию" }, { status: 400 });
  const submit = Boolean(body?.submit);
  const number = await nextNumber("pr", "ЗП");
  const created = await prisma.purchaseRequest.create({
    data: {
      number,
      authorId: session.user.id,
      category,
      title,
      reason: String(body?.reason || "").trim(),
      status: "draft",
      items: { create: items },
    },
    include: { items: true },
  });
  if (!submit) return NextResponse.json({ id: created.id });
  return submitRequest(created.id, session.user.id);
}

async function submitRequest(id: string, userId: string) {
  const row = await prisma.purchaseRequest.findUnique({
    where: { id },
    include: { items: true, author: { select: USER_SAFE_SELECT }, fundRequest: true },
  });
  if (!row || row.authorId !== userId) return NextResponse.json({ error: "Нет запроса" }, { status: 404 });
  if (!["draft", "rework"].includes(row.status)) {
    return NextResponse.json({ error: "Уже отправлен" }, { status: 400 });
  }
  const details = row.items
    .map((i) => `• ${i.name} × ${i.qty} ${i.unit}${i.url ? `\n  ${i.url}` : ""}`)
    .join("\n");
  let fundId = row.fundRequest?.id;
  if (!fundId) {
    const zs = await nextNumber("zs", "ЗС");
    const fund = await prisma.fundRequest.create({
      data: {
        number: zs,
        authorId: row.authorId,
        amount: 0,
        purpose: `Закупка: ${row.title}`,
        details: `${row.reason ? row.reason + "\n\n" : ""}Позиции:\n${details}`,
        status: "draft",
        purchaseRequestId: row.id,
      },
    });
    fundId = fund.id;
  }
  await prisma.purchaseRequest.update({ where: { id }, data: { status: "submitted" } });
  await notifyAho("Новый запрос на закупку", `${row.number} · ${row.title}`, `/requests/${id}`);
  return NextResponse.json({ id, fundId });
}

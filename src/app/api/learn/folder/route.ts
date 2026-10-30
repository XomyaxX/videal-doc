import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createTrainingFolder } from "@/lib/training";
import { audit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { title?: string; parentId?: string };
  try {
    const row = await createTrainingFolder({
      userId: session.user.id,
      title: String(body.title || ""),
      parentId: body.parentId ? String(body.parentId) : undefined,
    });
    await audit({
      userId: session.user.id,
      action: "training.folder",
      entity: "training",
      entityId: row.id,
      details: row.title,
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { issueGuestNda } from "@/lib/nda";
import { audit, auditRequestIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "users.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Нет данных" }, { status: 400 });
  }
  try {
    const nda = await issueGuestNda(session.user.id, body);
    await audit({
      userId: session.user.id,
      action: "nda.guest",
      entity: "guestNda",
      entityId: nda.id,
      ip: auditRequestIp(req),
    }).catch(() => null);
    return NextResponse.json({ id: nda.id, fileId: nda.fileId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось собрать";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

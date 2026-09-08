import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canHoldChatKey } from "@/lib/chat-server";
import { chatKeyStatus, getChatDek, makeAdminBackup, restoreAdminBackup } from "@/lib/chat-key";
import { audit } from "@/lib/audit";

export async function GET() {
  const session = await getSession();
  if (!session || !canHoldChatKey(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  await getChatDek();
  return NextResponse.json(await chatKeyStatus());
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canHoldChatKey(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "");
  try {
    if (action === "backup") {
      const phrase = await makeAdminBackup();
      await audit({ userId: session.user.id, action: "chat.key.backup", entity: "appSettings", entityId: "default" });
      return NextResponse.json({ phrase });
    }
    if (action === "restore") {
      await restoreAdminBackup(String(body?.phrase || ""));
      await audit({ userId: session.user.id, action: "chat.key.restore", entity: "appSettings", entityId: "default" });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { chatUnreadTotal, touchChatSeen } from "@/lib/chat-server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  void touchChatSeen(session.user.id);
  const unread = await chatUnreadTotal(session.user.id);
  return NextResponse.json({
    id: session.user.id,
    lastName: session.user.lastName,
    firstName: session.user.firstName,
    photoFileId: session.user.photoFileId,
    fullName: session.user.fullName,
    unread,
  });
}

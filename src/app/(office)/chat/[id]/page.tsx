import { requireUser } from "@/lib/auth";
import { canHoldChatKey } from "@/lib/chat-server";
import { ChatApp } from "../ChatApp";

export default async function ChatIdPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  return (
    <ChatApp
      me={{
        id: user.id,
        lastName: user.lastName,
        firstName: user.firstName,
        photoFileId: user.photoFileId,
        fullName: user.fullName,
      }}
      chatId={id}
      isAdmin={canHoldChatKey(user)}
    />
  );
}

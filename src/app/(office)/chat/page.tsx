import { requireUser } from "@/lib/auth";
import { canHoldChatKey } from "@/lib/chat-server";
import { canLeadProd, isFullProdLead } from "@/lib/prod";
import { ChatApp } from "./ChatApp";

export default async function ChatPage() {
  const user = await requireUser();
  return (
    <ChatApp
      me={{
        id: user.id,
        lastName: user.lastName,
        firstName: user.firstName,
        photoFileId: user.photoFileId,
        fullName: user.fullName,
      }}
      isAdmin={canHoldChatKey(user)}
      canLead={canLeadProd(user)}
      canAward={isFullProdLead(user)}
    />
  );
}

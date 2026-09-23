import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canJoinNow } from "@/lib/meet";
import { GuestJoinForm } from "./GuestJoinForm";

export default async function GuestJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meet = await prisma.meeting.findFirst({
    where: { guestToken: token, deletedAt: null, guestEnabled: true },
  });
  if (!meet || meet.status === "cancelled" || meet.status === "done") notFound();
  return (
    <GuestJoinForm
      token={token}
      title={meet.title}
      canJoin={canJoinNow(meet) || meet.status === "live"}
      recordConsent={meet.recordConsent}
    />
  );
}

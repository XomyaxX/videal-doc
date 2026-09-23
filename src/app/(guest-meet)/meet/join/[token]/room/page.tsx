import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { serializeMeet } from "@/lib/meet";
import { guestFromCookie } from "@/lib/meet-guest";
import { MeetRoom } from "@/app/(office)/meet/MeetRoom";

export default async function GuestRoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const guest = await guestFromCookie();
  const meet = await prisma.meeting.findFirst({
    where: { guestToken: token, deletedAt: null, guestEnabled: true },
    include: {
      author: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } },
      participants: {
        include: { user: { select: { id: true, lastName: true, firstName: true, middleName: true, photoFileId: true } } },
      },
      files: true,
      viewers: { select: { userId: true } },
    },
  });
  if (!meet || !guest || guest.meetingId !== meet.id) redirect(`/meet/join/${token}`);
  if (meet.status === "cancelled" || meet.status === "done") redirect(`/meet/join/${token}`);
  const dto = serializeMeet(meet, guest.id, [], { myName: guest.name });
  return (
    <div className="fixed inset-0 z-50">
      <MeetRoom meet={{ ...dto, canHost: false, canJoin: true }} meId={guest.id} hangupHref={`/meet/join/${token}`} />
    </div>
  );
}

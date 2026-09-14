import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMeetAccess, serializeMeet } from "@/lib/meet";
import { MeetRoom } from "../../MeetRoom";

export default async function MeetRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const meet = await requireMeetAccess(user, id);
  if (!meet) notFound();
  const recs = meet.files.length
    ? await prisma.storedFile.findMany({
        where: { id: { in: meet.files.map((f) => f.fileId) } },
        select: { id: true, originalName: true, mimeType: true, size: true },
      })
    : [];
  return <MeetRoom meet={serializeMeet(meet, user.id, recs)} meId={user.id} />;
}

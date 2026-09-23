import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMeetAccess } from "@/lib/meet";
import { kickMeetingJob } from "@/lib/meet-summary";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (meet.authorId !== session.user.id) return NextResponse.json({ error: "Повторить может организатор" }, { status: 403 });
  if (!meet.recordingFileId) return NextResponse.json({ error: "Сначала загрузите запись" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const fresh = Boolean(body?.retranscribe);
  await prisma.meeting.update({
    where: { id },
    data: {
      summaryStatus: "recording_uploaded",
      summaryError: fresh ? "расшифровка…" : "собираем сводку…",
      summaryProgress: fresh ? 5 : 80,
      transcript: fresh ? "" : meet.transcript || "",
      summaryJson: fresh ? "" : meet.summaryJson,
      summaryMarkdown: fresh ? "" : meet.summaryMarkdown,
    },
  });
  kickMeetingJob(id);
  return NextResponse.json({ ok: true });
}

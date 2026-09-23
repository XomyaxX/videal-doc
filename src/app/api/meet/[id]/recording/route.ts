import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireMeetAccess } from "@/lib/meet";
import { kickMeetingJob, saveMeetingRecording } from "@/lib/meet-summary";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  if (meet.authorId !== session.user.id) return NextResponse.json({ error: "Запись грузит организатор" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  const trackFiles = form.getAll("track").filter((x): x is File => x instanceof File);
  const trackNames = form.getAll("trackName").map((x) => String(x || "").slice(0, 80));
  if (!(file instanceof File) && !trackFiles.length) return NextResponse.json({ error: "Выберите файл записи" }, { status: 400 });
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const maxBytes = (settings?.maxUploadMb || 512) * 1024 * 1024;
  try {
    let recId = "";
    if (file instanceof File) {
      const buf = Buffer.from(await file.arrayBuffer());
      const rec = await saveMeetingRecording({
        buffer: buf,
        originalName: file.name,
        mime: file.type,
        userId: session.user.id,
        maxBytes,
      });
      recId = rec.id;
    }
    const tracks: { fileId: string; name: string }[] = [];
    for (let i = 0; i < trackFiles.length; i++) {
      const tf = trackFiles[i];
      const buf = Buffer.from(await tf.arrayBuffer());
      if (buf.length < 500) continue;
      const saved = await saveMeetingRecording({
        buffer: buf,
        originalName: tf.name || `track-${i}.webm`,
        mime: tf.type || "audio/webm",
        userId: session.user.id,
        maxBytes,
      });
      tracks.push({ fileId: saved.id, name: trackNames[i] || `Участник ${i + 1}` });
      if (!recId) recId = saved.id;
    }
    const stereo = String(form.get("stereo") || "") === "1" && tracks.length < 2;
    await prisma.meeting.update({
      where: { id },
      data: {
        recordingFileId: recId,
        recordingStereo: stereo,
        recordingTracks: JSON.stringify(tracks),
        speakerLeft: stereo ? (meet.speakerLeft || session.user.fullName || "Организатор") : meet.speakerLeft,
        speakerRight: stereo ? (meet.speakerRight || "Участники") : meet.speakerRight,
        summaryStatus: "recording_uploaded",
        summaryError: "очередь…",
        summaryProgress: 3,
        transcript: "",
        summaryJson: "",
        summaryMarkdown: "",
        summaryDeliveredAt: null,
        summaryDelivered: "",
        summaryTaskIds: "",
      },
    });
    kickMeetingJob(id);
    return NextResponse.json({ ok: true, fileId: recId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

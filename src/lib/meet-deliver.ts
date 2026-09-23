import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { notify } from "./notify";
import { fileRoot } from "./files";
import { parseDestinations, parseDelivered } from "./meet";

export async function deliverMeetingSummary(id: string, force = false) {
  const meet = await prisma.meeting.findUnique({
    where: { id },
    include: { participants: true, viewers: true, files: true },
  });
  if (!meet || meet.summaryStatus !== "ready") throw new Error("Сводка ещё не готова");
  if (meet.summaryDeliveredAt && !force) return parseDelivered(meet.summaryDelivered);
  const dest = parseDestinations(meet.destinations);
  const status: Record<string, string> = { meeting_card: "ok" };

  if (dest.includes("notify_participants")) {
    const ids = new Set<string>([
      meet.authorId,
      ...meet.participants.map((p) => p.userId),
      ...meet.viewers.map((v) => v.userId),
    ]);
    for (const userId of ids) {
      await notify({
        userId,
        title: "Сводка совещания готова",
        body: meet.title,
        link: `/meet/${meet.id}`,
        urgency: "normal",
      });
    }
    status.notify_participants = "ok";
  }

  if (dest.includes("attach_document")) {
    const md = meet.summaryMarkdown || meet.transcript || meet.title;
    const rec = await saveTextFile({
      userId: meet.authorId,
      name: `svodka-${meet.id.slice(0, 8)}.md`,
      body: md,
    });
    const already = meet.files.some((f) => f.fileId === rec.id);
    if (!already) {
      await prisma.meetingFile.create({ data: { meetingId: meet.id, fileId: rec.id } });
    }
    status.attach_document = "ok";
  }

  await prisma.meeting.update({
    where: { id: meet.id },
    data: { summaryDeliveredAt: new Date(), summaryDelivered: JSON.stringify(status) },
  });
  return status;
}

async function saveTextFile(opts: { userId: string; name: string; body: string }) {
  const buf = Buffer.from(opts.body, "utf8");
  const id = randomUUID();
  const rel = `${id}.md`;
  await mkdir(fileRoot(), { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ fileRoot(), rel), buf);
  return prisma.storedFile.create({
    data: {
      id,
      originalName: opts.name,
      mimeType: "text/markdown",
      size: buf.length,
      path: rel,
      sha256: createHash("sha256").update(buf).digest("hex"),
      createdById: opts.userId,
    },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { canSeeProdTask, shareRoot } from "@/lib/prod";
import { assertInside } from "@/lib/files";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const rec = await prisma.taskFile.findUnique({
    where: { id },
    include: { task: { include: { assignee: { include: { department: true } } } } },
  });
  if (!rec) return NextResponse.json({ error: "Нет файла" }, { status: 404 });
  if (!canSeeProdTask(session.user, rec.task)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const buf = await readFile(assertInside(shareRoot(), rec.absPath));
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": rec.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${encodeURIComponent(rec.originalName)}"`,
    },
  });
}

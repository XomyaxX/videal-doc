import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { userCan } from "@/lib/types";
import { assertInside, fileRoot } from "@/lib/files";
import { shareRoot } from "@/lib/prod";
import { previewMode } from "@/lib/library-kinds";
import { canSeeTaskChat, loadChatTask, taskChatScope } from "@/lib/prod-chat";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; fileId: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "prod.view")) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const { id, fileId } = await ctx.params;
  if (!(await canSeeTaskChat(session.user, id))) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const task = await loadChatTask(id);
  const scopeKey = task ? taskChatScope(task) : null;
  if (!scopeKey) return new NextResponse("Нет чата", { status: 404 });
  const rec = await prisma.prodChatFile.findFirst({
    where: { id: fileId, message: { scopeKey, deletedAt: null } },
  });
  if (!rec) return new NextResponse("Нет файла", { status: 404 });
  try {
    let buffer: Buffer;
    let mime = rec.mimeType || "application/octet-stream";
    let name = rec.originalName;
    if (rec.fileId) {
      const stored = await prisma.storedFile.findUnique({ where: { id: rec.fileId } });
      if (stored) {
        buffer = await readFile(/* turbopackIgnore: true */ assertInside(fileRoot(), path.join(fileRoot(), stored.path)));
        mime = stored.mimeType || mime;
        name = stored.originalName || name;
      } else {
        buffer = await readFile(/* turbopackIgnore: true */ assertInside(shareRoot(), rec.absPath));
      }
    } else {
      buffer = await readFile(/* turbopackIgnore: true */ assertInside(shareRoot(), rec.absPath));
    }
    const mode = previewMode({ mimeType: mime, originalName: name });
    const inline = mode !== "none";
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Файл не найден на диске", { status: 404 });
  }
}

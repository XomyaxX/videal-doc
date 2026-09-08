import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canReadStoredFile, readStoredFile } from "@/lib/files";
import { filePreviewPngs } from "@/lib/pdf/raster";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await params;
  if (!(await canReadStoredFile(session.user, id))) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const file = await readStoredFile(id);
  if (!file) return new NextResponse("Файл не найден", { status: 404 });
  const preview = req.nextUrl.searchParams.get("preview") === "1";
  if (preview) {
    const pages = await filePreviewPngs({
      buffer: file.buffer,
      mimeType: file.rec.mimeType,
      originalName: file.rec.originalName,
    });
    if (pages[0]) {
      return new NextResponse(new Uint8Array(pages[0].buffer), {
        headers: {
          "Content-Type": pages[0].mime,
          "Cache-Control": "private, max-age=3600",
        },
      });
    }
  }
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.rec.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.rec.originalName)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

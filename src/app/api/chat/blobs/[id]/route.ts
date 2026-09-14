import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { readEncryptedBlob, requireMember } from "@/lib/chat-server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await ctx.params;
  const file = await readEncryptedBlob(id);
  if (!file) return new NextResponse("Нет файла", { status: 404 });
  const member = await requireMember(session.user, file.rec.chatId);
  if (!member) return new NextResponse("Нет права", { status: 403 });
  if (req.nextUrl.searchParams.get("preview") === "1") {
    if (!file.rec.previewId) return new NextResponse(null, { status: 204 });
    const glb = await readEncryptedBlob(file.rec.previewId);
    if (!glb) return new NextResponse(null, { status: 204 });
    return new NextResponse(new Uint8Array(glb.buffer), {
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "private, max-age=3600",
      },
    });
  }
  const mime = file.rec.mime || "application/octet-stream";
  const name = file.rec.originalName || "file";
  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

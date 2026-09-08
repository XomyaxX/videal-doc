import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildHrPdfById } from "@/lib/pdf/hr-build";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.hrRequest.findUnique({ where: { id } });
  if (!row) return new NextResponse("Нет", { status: 404 });
  if (row.authorId !== session.user.id && row.managerId !== session.user.id) {
    return new NextResponse("Нельзя", { status: 403 });
  }
  const pdf = await buildHrPdfById(id);
  if (!pdf) return new NextResponse("Нет", { status: 404 });
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${encodeURIComponent(pdf.number)}.pdf`,
    },
  });
}

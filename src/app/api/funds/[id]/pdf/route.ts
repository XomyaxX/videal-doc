import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { buildFundPdfById } from "@/lib/pdf/fund-build";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await params;
  const row = await prisma.fundRequest.findFirst({ where: { id, deletedAt: null } });
  if (!row) return new NextResponse("Не найден", { status: 404 });
  const viewAll = userCan(session.user, "finance.view_all") || userCan(session.user, "finance.approve");
  if (row.authorId !== session.user.id && row.managerId !== session.user.id && !viewAll) {
    return new NextResponse("Нельзя", { status: 403 });
  }
  const pdf = await buildFundPdfById(id);
  if (!pdf) return new NextResponse("Не найден", { status: 404 });
  return new NextResponse(new Uint8Array(pdf.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${encodeURIComponent(pdf.number)}.pdf`,
    },
  });
}

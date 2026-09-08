import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { renderAdvancePdf } from "@/lib/pdf/render";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await params;
  const report = await prisma.advanceReport.findFirst({ where: { id, deletedAt: null } });
  if (!report) return new NextResponse("Не найден", { status: 404 });
  if (report.userId !== session.user.id && !userCan(session.user, "finance.view_all")) {
    return new NextResponse("Нельзя", { status: 403 });
  }
  const pdf = await renderAdvancePdf(id);
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${encodeURIComponent(report.number)}.pdf`,
    },
  });
}

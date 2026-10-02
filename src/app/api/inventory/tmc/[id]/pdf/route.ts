import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { fullName, shortName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";
import { defaultTmcCommission, parseTmcCommission } from "@/lib/tmc";
import { renderTmcPdf } from "@/lib/pdf/render";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.tmcSheet.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          lastName: true,
          firstName: true,
          middleName: true,
          department: { select: { name: true } },
          position: { select: { name: true } },
        },
      },
      lines: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) return new NextResponse("Нет карточки", { status: 404 });
  const manage = userCan(session.user, "inventory.manage");
  if (!manage && row.userId !== session.user.id) return new NextResponse("Нет права", { status: 403 });
  const commission = parseTmcCommission(row.commissionJson, defaultTmcCommission(shortName(row.user)));
  const buf = await renderTmcPdf({
    number: row.number,
    date: fmtDate(row.createdAt),
    fullName: fullName(row.user),
    position: row.user.position?.name || "",
    workplace: row.user.department?.name || "",
    lines: row.lines,
    commission,
  });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=${encodeURIComponent(row.number)}.pdf`,
    },
  });
}

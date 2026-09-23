import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/names";
import { officeYmd } from "@/lib/dates";
import { defaultClearancePrint, parseClearancePrint } from "@/lib/clearance";
import { renderClearancePdf } from "@/lib/pdf/render";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  const { id } = await ctx.params;
  const row = await prisma.clearanceSheet.findUnique({
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
  if (!row) return new NextResponse("Нет листа", { status: 404 });
  const manage = userCan(session.user, "inventory.manage");
  if (!manage && row.userId !== session.user.id) return new NextResponse("Нет права", { status: 403 });
  const fallback = defaultClearancePrint({
    fullName: fullName(row.user),
    workplace: row.user.department?.name || "",
    position: row.user.position?.name || "",
    dismissedAt: officeYmd(row.createdAt),
    equipment: row.lines,
  });
  const data = parseClearancePrint(row.printJson, fallback);
  const buf = await renderClearancePdf(data);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(row.number)}.pdf"`,
    },
  });
}

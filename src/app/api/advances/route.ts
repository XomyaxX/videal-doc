import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { audit } from "@/lib/audit";
import { rubToKopecks } from "@/lib/money";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "finance.create")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const fundIds = Array.isArray(body.fundIds) ? body.fundIds.map(String).filter(Boolean) : [];
  const funds = fundIds.length
    ? await prisma.fundRequest.findMany({
        where: {
          id: { in: fundIds },
          authorId: session.user.id,
          status: "paid",
          advanceReportId: null,
          deletedAt: null,
        },
      })
    : [];
  const fromFunds = funds.reduce((s, f) => s + f.amount, 0);
  const issuedAmount = fromFunds || (body.issuedAmount ? rubToKopecks(body.issuedAmount) : 0);
  const purpose =
    String(body.purpose || "").trim() || funds.map((f) => f.purpose).filter(Boolean).join("; ");
  const number = await nextNumber("ao", "АО");
  const row = await prisma.advanceReport.create({
    data: {
      number,
      userId: session.user.id,
      purpose,
      issuedAmount,
    },
  });
  if (funds.length) {
    await prisma.fundRequest.updateMany({
      where: { id: { in: funds.map((f) => f.id) } },
      data: { advanceReportId: row.id },
    });
  }
  await audit({ userId: session.user.id, action: "advance.create", entity: "advance", entityId: row.id });
  return NextResponse.json({ id: row.id, number: row.number });
}

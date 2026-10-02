import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { audit } from "@/lib/audit";
import { loadAssignmentPdfData } from "@/lib/pdf/assignment-data";
import { renderAssignmentPdf } from "@/lib/pdf/render";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  if (!userCan(session.user, "inventory.manage")) return new NextResponse("Нет права", { status: 403 });
  const orderNo = req.nextUrl.searchParams.get("order") || "";
  const ymd = req.nextUrl.searchParams.get("date") || "";
  const data = await loadAssignmentPdfData({ orderNo, ymd });
  const buf = await renderAssignmentPdf(data);
  await audit({
    userId: session.user.id,
    action: "inventory.assignment.pdf",
    entity: "inventory",
    details: `приказ № ${data.orderNo} от ${data.orderDate}, сотрудников ${data.groups.length}`,
  });
  const name = `perechen-oborudovaniya-${data.orderDate.replace(/\./g, "-")}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}

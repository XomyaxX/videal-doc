import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { audit } from "@/lib/audit";
import { loadRoundStatement } from "@/lib/inventory-statement-server";
import { renderInventoryStatementPdf } from "@/lib/pdf/render";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  if (!userCan(session.user, "inventory.manage")) return new NextResponse("Нет права", { status: 403 });
  const { id } = await ctx.params;
  const data = await loadRoundStatement(id);
  if (!data) return new NextResponse("Нет тура", { status: 404 });
  const buf = await renderInventoryStatementPdf(data);
  await audit({
    userId: session.user.id,
    action: "inventory.round.pdf",
    entity: "inventory-round",
    entityId: id,
    details: data.interim ? `${data.number} промежуточная` : data.number,
  });
  const filename = `${data.number}${data.interim ? "-preview" : ""}.pdf`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

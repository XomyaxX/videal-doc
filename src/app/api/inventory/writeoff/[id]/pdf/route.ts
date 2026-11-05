import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { canWriteOff } from "@/lib/writeoff";
import { writeOffPdfModel } from "@/lib/writeoff-server";
import { renderWriteOffPdf } from "@/lib/pdf/render";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  if (!canWriteOff(session.user)) return new NextResponse("Нет права", { status: 403 });
  const { id } = await ctx.params;
  const model = await writeOffPdfModel(id);
  if (!model) return new NextResponse("Нет акта", { status: 404 });
  const buf = await renderWriteOffPdf({ ...model.data, draft: model.draft, cancelled: model.cancelled });
  await audit({
    userId: session.user.id,
    action: "writeoff.pdf",
    entity: "writeoff",
    entityId: id,
    details: model.number,
  });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(model.number)}.pdf"`,
    },
  });
}

import { prisma } from "@/lib/prisma";
import { renderLetterPdf } from "@/lib/pdf/render";
import { officeDateParts, officeYmd } from "@/lib/dates";
import { shortNamePlain, fullName } from "@/lib/names";
import { orgLetterhead, orgNameShort } from "@/lib/org";
import { hrType, letterBody } from "@/lib/hrdocs";

export async function buildHrPdfById(id: string): Promise<{ buffer: Buffer; number: string; title: string } | null> {
  const row = await prisma.hrRequest.findUnique({
    where: { id },
    include: {
      author: { include: { position: true, department: true } },
      manager: { include: { position: true } },
    },
  });
  if (!row) return null;
  const org = await prisma.organization.findFirst();
  const payload = JSON.parse(row.payloadJson || "{}") as Record<string, string>;
  const spec = hrType(row.type);
  const ymd = officeYmd(row.createdAt);
  const sign = officeDateParts(new Date(`${ymd}T12:00:00+06:00`));
  const buffer = await renderLetterPdf({
    toTitle: row.manager.position?.name || "Руководителю",
    orgName: orgNameShort(org),
    letterhead: orgLetterhead(org),
    toName: fullName(row.manager),
    fromRole: row.author.position?.name || row.author.department?.name || "",
    fromName: shortNamePlain(row.author),
    title: spec?.title || row.title,
    paragraphs: letterBody(row.type, payload),
    number: row.number,
    signDay: sign.day,
    signMonth: sign.month,
    signYear: ymd.slice(0, 4),
  });
  return { buffer, number: row.number, title: spec?.title || row.title };
}

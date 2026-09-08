import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nextNumber } from "@/lib/sequence";
import { saveUpload } from "@/lib/files";
import { audit } from "@/lib/audit";
import { registryDir } from "@/lib/registry";
import { officeYmd } from "@/lib/dates";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });

  const form = await req.formData();
  const direction = String(form.get("direction") || "") === "out" ? "out" : "in";
  const correspondent = String(form.get("correspondent") || "").trim();
  const subject = String(form.get("subject") || "").trim();
  const comment = String(form.get("comment") || "").trim();
  const datedRaw = String(form.get("datedAt") || "").trim();
  if (!correspondent) return NextResponse.json({ error: "Укажите, от кого или кому" }, { status: 400 });
  if (!subject) return NextResponse.json({ error: "Укажите тему" }, { status: 400 });

  let datedAt = new Date();
  if (/^\d{4}-\d{2}-\d{2}$/.test(datedRaw)) {
    datedAt = new Date(`${datedRaw}T12:00:00.000Z`);
  }

  let fileId = "";
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
    const maxBytes = (settings?.maxUploadMb || 32) * 1024 * 1024;
    const saved = await saveUpload({
      buffer: Buffer.from(await file.arrayBuffer()),
      originalName: file.name,
      declaredMime: file.type,
      userId: session.user.id,
      maxBytes,
    });
    fileId = saved.id;
  }

  const spec = registryDir(direction);
  const number = await nextNumber(direction === "out" ? "out" : "in", spec.prefix);
  const row = await prisma.correspondence.create({
    data: {
      direction,
      number,
      datedAt,
      correspondent,
      subject,
      comment,
      fileId,
      registeredById: session.user.id,
    },
  });
  await audit({
    userId: session.user.id,
    action: "registry.create",
    entity: "correspondence",
    entityId: row.id,
    details: `${row.number} · ${subject}`,
  });
  return NextResponse.json({ id: row.id, number: row.number, ymd: officeYmd(datedAt) });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { storeSecret } from "@/lib/secret";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json();
  const current = await prisma.appSettings.findUnique({ where: { id: "default" } });
  await prisma.appSettings.update({
    where: { id: "default" },
    data: {
      maxUploadMb: Number(body.maxUploadMb) || 32,
      sessionDays: Number(body.sessionDays) || 30,
      fnsEnabled: Boolean(body.fnsEnabled),
      fnsLogin: String(body.fnsLogin || ""),
      fnsPassword: body.fnsPassword ? storeSecret(String(body.fnsPassword)) : current?.fnsPassword || "",
      smtpHost: String(body.smtpHost || ""),
      smtpPort: Number(body.smtpPort) || 587,
      smtpUser: String(body.smtpUser || ""),
      smtpPassword: body.smtpPassword ? storeSecret(String(body.smtpPassword)) : current?.smtpPassword || "",
      smtpFrom: String(body.smtpFrom || ""),
      mailAutoSend: body.mailAutoSend !== false && body.mailAutoSend !== "false",
      accountantEmail: String(body.accountantEmail || "vidial_kiv@mail.ru").trim(),
      imapHost: String(body.imapHost || ""),
      imapPort: Number(body.imapPort) || 993,
      imapUser: String(body.imapUser || ""),
      imapPassword: body.imapPassword ? storeSecret(String(body.imapPassword)) : current?.imapPassword || "",
      imapFolder: String(body.imapFolder || "INBOX"),
    },
  });
  return NextResponse.json({ ok: true });
}

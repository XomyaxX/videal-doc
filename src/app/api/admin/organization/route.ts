import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "org.edit")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json();
  const org = await prisma.organization.findFirst();
  if (!org) return NextResponse.json({ error: "Нет организации" }, { status: 404 });
  const fields = [
    "name",
    "shortName",
    "inn",
    "kpp",
    "ogrn",
    "okpo",
    "legalAddress",
    "actualAddress",
    "postalAddress",
    "phone",
    "email",
    "directorName",
    "directorTitle",
    "accountantName",
    "bankName",
    "bankBik",
    "bankAccount",
    "corrAccount",
    "debitAccount",
  ] as const;
  const data: Record<string, string> = {};
  for (const f of fields) data[f] = String(body?.[f] ?? "");
  await prisma.organization.update({ where: { id: org.id }, data });
  await audit({ userId: session.user.id, action: "org.update", entity: "organization", entityId: org.id });
  return NextResponse.json({ ok: true });
}

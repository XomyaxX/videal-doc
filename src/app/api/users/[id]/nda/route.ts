import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { canEditUser } from "@/lib/role-guard";
import { cleanNdaPassport, issueEmployeeNda, ndaPassportMissing } from "@/lib/nda";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "users.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target || target.deletedAt) return NextResponse.json({ error: "Нет сотрудника" }, { status: 404 });
  const blocked = canEditUser(session.user, target);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const body = await req.json().catch(() => null);
  const filling = Boolean(body && (body.series !== undefined || body.issuedBy !== undefined || body.city !== undefined));
  let passport = null;
  if (filling) {
    const birth = String(body.birthDate || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      return NextResponse.json({ error: "Укажите дату рождения" }, { status: 400 });
    }
    passport = cleanNdaPassport(body);
    const miss = ndaPassportMissing(passport);
    if (miss) return NextResponse.json({ error: miss }, { status: 400 });
    await prisma.user.update({
      where: { id },
      data: { birthDate: new Date(`${birth}T12:00:00.000Z`) },
    });
  }
  try {
    const nda = await issueEmployeeNda(id, passport);
    if (!nda) return NextResponse.json({ error: "Не удалось собрать" }, { status: 400 });
    return NextResponse.json({ fileId: nda.fileId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось собрать";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

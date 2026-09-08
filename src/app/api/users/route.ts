import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { hashPassword, randomTempPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { canAssignRole } from "@/lib/role-guard";
import { storeSecret } from "@/lib/secret";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "users.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const login = String(body?.login || "").trim().toLowerCase();
  const lastName = String(body?.lastName || "").trim();
  const firstName = String(body?.firstName || "").trim();
  if (!login || !lastName || !firstName) {
    return NextResponse.json({ error: "Нужны логин, фамилия и имя" }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { login } });
  if (exists) return NextResponse.json({ error: "Такой логин уже есть" }, { status: 400 });
  const role = await prisma.role.findUnique({ where: { id: String(body?.roleId || "") } });
  if (!role) return NextResponse.json({ error: "Выберите роль" }, { status: 400 });
  const roleErr = canAssignRole(session.user, role);
  if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });
  const temp = randomTempPassword();
  const user = await prisma.user.create({
    data: {
      login,
      passwordHash: hashPassword(temp),
      lastName,
      firstName,
      middleName: String(body?.middleName || "").trim(),
      phone: String(body?.phone || "").trim(),
      email: String(body?.email || "").trim(),
      smtpPassword: body?.smtpPassword ? storeSecret(String(body.smtpPassword)) : "",
      personnelNumber: String(body?.personnelNumber || "").trim(),
      inn: String(body?.inn || "").trim(),
      roleId: String(body?.roleId || ""),
      departmentId: body?.departmentId || null,
      positionId: body?.positionId || null,
      managerId: body?.managerId || null,
      hiredAt: body?.hiredAt ? new Date(body.hiredAt) : null,
      birthDate: body?.birthDate ? new Date(`${body.birthDate}T12:00:00.000Z`) : null,
      mustChangePassword: true,
    },
  });
  if (Array.isArray(body?.skillIds)) {
    const ids = body.skillIds.map(String).filter(Boolean);
    if (ids.length) {
      await prisma.userSkill.createMany({ data: ids.map((skillId: string) => ({ userId: user.id, skillId })) });
    }
  }
  await audit({
    userId: session.user.id,
    action: "user.create",
    entity: "user",
    entityId: user.id,
    details: login,
  });
  const { syncOfficialChats } = await import("@/lib/chat-official");
  await syncOfficialChats(true);
  return NextResponse.json({ id: user.id, tempPassword: temp });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { hashPassword, randomTempPassword } from "@/lib/password";
import { audit } from "@/lib/audit";
import { canAssignRole, canEditUser } from "@/lib/role-guard";
import { storeSecret } from "@/lib/secret";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "users.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target || target.deletedAt) return NextResponse.json({ error: "Нет" }, { status: 404 });
  const blocked = canEditUser(session.user, target);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  const data: Record<string, unknown> = {};
  const fields = [
    "lastName",
    "firstName",
    "middleName",
    "phone",
    "email",
    "personnelNumber",
    "inn",
    "roleId",
    "status",
    "login",
  ] as const;
  for (const f of fields) {
    if (body?.[f] !== undefined) data[f] = String(body[f]).trim();
  }
  data.departmentId = body?.departmentId || null;
  data.positionId = body?.positionId || null;
  data.managerId = body?.managerId || null;
  data.hiredAt = body?.hiredAt ? new Date(body.hiredAt) : null;
  data.birthDate = body?.birthDate ? new Date(`${body.birthDate}T12:00:00.000Z`) : null;
  const smtpPassword = String(body?.smtpPassword || "");
  if (smtpPassword) data.smtpPassword = storeSecret(smtpPassword);
  if (body?.roleId && String(body.roleId) !== target.roleId) {
    if (id === session.user.id && session.user.roleCode !== "superadmin") {
      return NextResponse.json({ error: "Нельзя сменить свою роль" }, { status: 403 });
    }
    const nextRole = await prisma.role.findUnique({ where: { id: String(body.roleId) } });
    if (!nextRole) return NextResponse.json({ error: "Нет такой роли" }, { status: 400 });
    const roleErr = canAssignRole(session.user, nextRole);
    if (roleErr) return NextResponse.json({ error: roleErr }, { status: 403 });
  }
  await prisma.user.update({ where: { id }, data });
  if (Array.isArray(body?.skillIds)) {
    const ids = body.skillIds.map(String).filter(Boolean);
    await prisma.userSkill.deleteMany({ where: { userId: id } });
    if (ids.length) {
      await prisma.userSkill.createMany({ data: ids.map((skillId: string) => ({ userId: id, skillId })) });
    }
  }
  await audit({ userId: session.user.id, action: "user.update", entity: "user", entityId: id });
  const { syncOfficialChats } = await import("@/lib/chat-official");
  await syncOfficialChats(true);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "users.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  if (id === session.user.id) return NextResponse.json({ error: "Нельзя удалить себя" }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) return NextResponse.json({ error: "Нет" }, { status: 404 });
  const blocked = canEditUser(session.user, target);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "dismissed" } });
  await prisma.session.deleteMany({ where: { userId: id } });
  await audit({ userId: session.user.id, action: "user.delete", entity: "user", entityId: id });
  const { syncOfficialChats } = await import("@/lib/chat-official");
  await syncOfficialChats(true);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "users.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const target = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!target) return NextResponse.json({ error: "Нет" }, { status: 404 });
  const blocked = canEditUser(session.user, target);
  if (blocked) return NextResponse.json({ error: blocked }, { status: 403 });
  if (body?.action === "reset-password") {
    const temp = randomTempPassword();
    await prisma.user.update({
      where: { id },
      data: { passwordHash: hashPassword(temp), mustChangePassword: true },
    });
    await prisma.session.deleteMany({ where: { userId: id } });
    await audit({ userId: session.user.id, action: "user.reset_password", entity: "user", entityId: id });
    return NextResponse.json({ tempPassword: temp });
  }
  if (body?.action === "reset-2fa") {
    await prisma.user.update({
      where: { id },
      data: { totpSecret: "", totpEnabled: false },
    });
    await prisma.session.updateMany({ where: { userId: id }, data: { totpOk: false } });
    await prisma.userDevice.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), pushToken: "" } });
    await audit({ userId: session.user.id, action: "2fa.reset", entity: "user", entityId: id });
    return NextResponse.json({ ok: true });
  }
  if (body?.action === "restore") {
    await prisma.user.update({ where: { id }, data: { deletedAt: null, status: "active" } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

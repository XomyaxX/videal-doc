import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { ALL_PERMISSION_CODES } from "@/lib/permissions";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !userCan(session.user, "roles.manage")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const role = await prisma.role.findUnique({ where: { id } });
  if (!role) return NextResponse.json({ error: "Нет" }, { status: 404 });
  if (role.code === "superadmin" && session.user.roleCode !== "superadmin") {
    return NextResponse.json({ error: "Нельзя менять супер-администратора" }, { status: 403 });
  }
  let perms = (Array.isArray(body.permissions) ? body.permissions : []).filter((p: string) =>
    ALL_PERMISSION_CODES.includes(p as (typeof ALL_PERMISSION_CODES)[number]),
  );
  if (session.user.roleCode !== "superadmin") {
    const have = new Set(session.user.permissions);
    perms = perms.filter((p: string) => have.has(p));
  }
  await prisma.role.update({
    where: { id },
    data: {
      name: String(body.name || ""),
      description: String(body.description || ""),
      permissions: JSON.stringify(perms),
    },
  });
  await audit({ userId: session.user.id, action: "role.update", entity: "role", entityId: id });
  return NextResponse.json({ ok: true });
}

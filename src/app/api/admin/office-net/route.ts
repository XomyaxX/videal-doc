import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { mergeOfficeNets, parseLanList, parseOfficeCidrs, requestClientIp } from "@/lib/presence";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const s = await prisma.appSettings.findUnique({ where: { id: "default" }, select: { officeCidrs: true } });
  return NextResponse.json({
    cidrs: parseOfficeCidrs(s?.officeCidrs || ""),
    currentIp: requestClientIp(req),
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const ip = requestClientIp(req);
  const local = parseLanList(body?.localIps);
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  let have = parseOfficeCidrs(s?.officeCidrs || "");
  const add: string[] = [...local];
  if (ip && ip !== "127.0.0.1" && ip !== "::1") add.push(ip);
  if (add.length === 0) {
    return NextResponse.json(
      { error: "Не вижу ни локальную сеть, ни внешний IP. Нажмите кнопку с компьютера в офисе, в Chrome." },
      { status: 400 },
    );
  }
  have = mergeOfficeNets(have, add);
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { officeCidrs: have.join("\n") },
  });
  await audit({
    userId: session.user.id,
    action: "office.ip.add",
    entity: "settings",
    details: have.join(", "),
  });
  return NextResponse.json({ ok: true, cidrs: have, currentIp: ip, local });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const drop = String(body?.ip || "").trim();
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const have = parseOfficeCidrs(s?.officeCidrs || "").filter((x) => x !== drop);
  await prisma.appSettings.update({
    where: { id: "default" },
    data: { officeCidrs: have.join("\n") },
  });
  return NextResponse.json({ ok: true, cidrs: have });
}

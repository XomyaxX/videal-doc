import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/names";
import { audit } from "@/lib/audit";
import {
  normalizeMac,
  scanOfficeLan,
  rememberLanSightings,
  stationOnline,
  startIdentify,
  stopIdentify,
  listIdentifyScreens,
  bindIdentifyScreen,
  bindAllLoggedIn,
} from "@/lib/office-lan";

function serializeStation(s: {
  id: string;
  userId: string;
  mac: string;
  ipv4: string;
  label: string;
  lastSeenAt: Date | null;
  user?: { lastName: string; firstName: string; middleName: string };
}) {
  return {
    id: s.id,
    userId: s.userId,
    mac: s.mac,
    ipv4: s.ipv4,
    label: s.label,
    lastSeenAt: s.lastSeenAt?.toISOString() || null,
    online: stationOnline(s.lastSeenAt),
    userName: s.user ? fullName(s.user) : "",
  };
}

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  await stopIdentify();
  const stations = await prisma.officeStation.findMany({
    include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
    orderBy: { lastSeenAt: "desc" },
  });
  const ident = await listIdentifyScreens();
  return NextResponse.json({ stations: stations.map(serializeStation), identify: ident });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || (!userCan(session.user, "admin.settings") && !userCan(session.user, "users.manage"))) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const action = String(body?.action || "scan");
  if (action === "scan" && !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Сканировать сеть может админ" }, { status: 403 });
  }

  if (action === "scan") {
    const hosts = await scanOfficeLan();
    const stations = await rememberLanSightings(hosts);
    const byMac = new Map(stations.map((s) => [s.mac, s]));
    return NextResponse.json({
      hosts: hosts.map((h) => {
        const st = byMac.get(h.mac);
        return {
          ip: h.ip,
          mac: h.mac,
          stationId: st?.id || "",
          userId: st?.userId || "",
          userName: st?.user ? fullName(st.user) : "",
        };
      }),
      stations: (await prisma.officeStation.findMany({
        include: { user: { select: { lastName: true, firstName: true, middleName: true } } },
        orderBy: { lastSeenAt: "desc" },
      })).map(serializeStation),
    });
  }

  if (action === "bind-all") {
    if (!userCan(session.user, "admin.settings")) {
      return NextResponse.json({ error: "Нет права" }, { status: 403 });
    }
    const result = await bindAllLoggedIn();
    await audit({
      userId: session.user.id,
      action: "lan.bind-all",
      entity: "officeStation",
      details: `bound ${result.bound}`,
    });
    return NextResponse.json({
      ok: true,
      bound: result.bound,
      skipped: result.skipped,
      hosts: result.hosts,
      stations: result.stations.map(serializeStation),
      identify: await listIdentifyScreens(),
    });
  }

  if (action === "identify-start") {
    if (!userCan(session.user, "admin.settings")) {
      return NextResponse.json({ error: "Нет права" }, { status: 403 });
    }
    const until = await startIdentify();
    await audit({ userId: session.user.id, action: "lan.identify.start", entity: "settings" });
    return NextResponse.json({ ok: true, until: until.toISOString(), identify: await listIdentifyScreens() });
  }

  if (action === "identify-stop") {
    if (!userCan(session.user, "admin.settings")) {
      return NextResponse.json({ error: "Нет права" }, { status: 403 });
    }
    await stopIdentify();
    await audit({ userId: session.user.id, action: "lan.identify.stop", entity: "settings" });
    return NextResponse.json({ ok: true, identify: { until: null, screens: [] } });
  }

  if (action === "identify-bind") {
    try {
      const st = await bindIdentifyScreen({
        screenId: String(body?.screenId || ""),
        userId: String(body?.userId || ""),
        label: String(body?.label || ""),
      });
      await audit({ userId: session.user.id, action: "lan.bind", entity: "officeStation", entityId: st.id, details: st.mac });
      return NextResponse.json({ ok: true, id: st.id, identify: await listIdentifyScreens() });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
    }
  }

  if (action === "bind") {
    const mac = normalizeMac(String(body?.mac || ""));
    const userId = String(body?.userId || "");
    const label = String(body?.label || "").trim().slice(0, 80);
    const ipv4 = String(body?.ipv4 || "").trim().slice(0, 40);
    if (!mac) return NextResponse.json({ error: "Некорректный MAC" }, { status: 400 });
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) return NextResponse.json({ error: "Нет сотрудника" }, { status: 400 });
    const row = await prisma.officeStation.upsert({
      where: { mac },
      create: { userId, mac, ipv4, label: label || "ПК" },
      update: { userId, ipv4: ipv4 || undefined, label: label || undefined },
    });
    await audit({ userId: session.user.id, action: "lan.bind", entity: "officeStation", entityId: row.id, details: mac });
    return NextResponse.json({ ok: true, id: row.id });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || (!userCan(session.user, "admin.settings") && !userCan(session.user, "users.manage"))) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Нет станции" }, { status: 400 });
  await prisma.officeStation.deleteMany({ where: { id } });
  await audit({ userId: session.user.id, action: "lan.unbind", entity: "officeStation", entityId: id });
  return NextResponse.json({ ok: true });
}

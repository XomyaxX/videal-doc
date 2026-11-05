import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit, auditRequestIp } from "@/lib/audit";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { isOfficeYmd, officeYmd, parseOfficeStamp } from "@/lib/dates";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "presence.review")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const url = req.nextUrl;
  const from = url.searchParams.get("from") || officeYmd();
  const to = url.searchParams.get("to") || from;
  const [flags, days] = await Promise.all([
    prisma.attendanceFlag.findMany({
      where: { ymd: { gte: from, lte: to }, resolvedAt: null },
      include: { user: { select: { lastName: true, firstName: true, middleName: true, login: true } } },
      orderBy: [{ ymd: "desc" }, { createdAt: "desc" }],
    }),
    prisma.attendanceDay.findMany({
      where: { ymd: { gte: from, lte: to } },
      include: { user: { select: { lastName: true, firstName: true, middleName: true, login: true } } },
      orderBy: [{ ymd: "asc" }, { user: { lastName: "asc" } }],
    }),
  ]);
  return NextResponse.json({ flags, days });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "presence.review")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const id = String(body?.id || "");
  if (!id) return NextResponse.json({ error: "Нет записи" }, { status: 400 });
  await prisma.attendanceFlag.update({
    where: { id },
    data: { resolvedAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

function iso(d: Date | null | undefined) {
  return d ? d.toISOString() : "—";
}

/** Superadmin correction of one employee's arrival/departure. Does not touch QR mark-in/out. */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  if (session.user.roleCode !== "superadmin") {
    return NextResponse.json({ error: "Только суперадмин" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Нет данных" }, { status: 400 });
  }
  const userId = String(body.userId || "").trim();
  const ymd = String(body.ymd || "").trim();
  if (!userId) return NextResponse.json({ error: "Нет сотрудника" }, { status: 400 });
  if (!isOfficeYmd(ymd)) return NextResponse.json({ error: "Неверная дата" }, { status: 400 });
  const hasIn = Object.prototype.hasOwnProperty.call(body, "inAt");
  const hasOut = Object.prototype.hasOwnProperty.call(body, "outAt");
  if (!hasIn && !hasOut) return NextResponse.json({ error: "Укажите приход или уход" }, { status: 400 });

  const inParsed = hasIn ? parseOfficeStamp(ymd, body.inAt) : null;
  if (inParsed && !inParsed.ok) return NextResponse.json({ error: inParsed.error }, { status: 400 });
  const outParsed = hasOut ? parseOfficeStamp(ymd, body.outAt) : null;
  if (outParsed && !outParsed.ok) return NextResponse.json({ error: outParsed.error }, { status: 400 });

  // History correction: do not reject suspended, dismissed, or soft-deleted employees.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });

  const existing = await prisma.attendanceDay.findUnique({
    where: { userId_ymd: { userId, ymd } },
  });

  const data: {
    inAt?: Date | null;
    outAt?: Date | null;
    inSource?: string;
    outSource?: string;
  } = {};
  if (inParsed) {
    const next = inParsed.at;
    const prev = existing?.inAt ?? null;
    if ((prev?.getTime() ?? null) !== (next?.getTime() ?? null)) {
      data.inAt = next;
      data.inSource = "admin_edit";
    }
  }
  if (outParsed) {
    const next = outParsed.at;
    const prev = existing?.outAt ?? null;
    if ((prev?.getTime() ?? null) !== (next?.getTime() ?? null)) {
      data.outAt = next;
      data.outSource = "admin_edit";
    }
  }
  if (!("inAt" in data) && !("outAt" in data)) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      day: existing
        ? {
            id: existing.id,
            userId: existing.userId,
            ymd: existing.ymd,
            inAt: existing.inAt,
            outAt: existing.outAt,
            inSource: existing.inSource,
            outSource: existing.outSource,
          }
        : null,
    });
  }

  const day = await prisma.attendanceDay.upsert({
    where: { userId_ymd: { userId, ymd } },
    create: {
      userId,
      ymd,
      inAt: data.inAt ?? null,
      outAt: data.outAt ?? null,
      inSource: data.inSource || "",
      outSource: data.outSource || "",
    },
    update: data,
  });

  await audit({
    userId: session.user.id,
    action: "attendance.edit",
    entity: "attendanceDay",
    entityId: day.id,
    ip: auditRequestIp(req),
    details: [
      `ymd=${ymd}`,
      `user=${userId}`,
      `in ${iso(existing?.inAt)}→${iso(day.inAt)}`,
      `inSource ${existing?.inSource || "—"}→${day.inSource || "—"}`,
      `out ${iso(existing?.outAt)}→${iso(day.outAt)}`,
      `outSource ${existing?.outSource || "—"}→${day.outSource || "—"}`,
    ].join("; "),
  });

  return NextResponse.json({
    ok: true,
    day: {
      id: day.id,
      userId: day.userId,
      ymd: day.ymd,
      inAt: day.inAt,
      outAt: day.outAt,
      inSource: day.inSource,
      outSource: day.outSource,
    },
  });
}

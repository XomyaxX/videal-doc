import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/names";
import { canWriteOff, reasonLabel, WriteOffError } from "@/lib/writeoff";
import { createWriteOffSheet } from "@/lib/writeoff-server";

async function gate() {
  const session = await getSession();
  if (!session) return { error: NextResponse.json({ error: "Нужно войти" }, { status: 401 }) };
  if (!canWriteOff(session.user)) return { error: NextResponse.json({ error: "Нет права" }, { status: 403 }) };
  return { session };
}

function fail(e: unknown) {
  if (e instanceof WriteOffError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(e);
  return NextResponse.json({ error: "Не удалось выполнить" }, { status: 500 });
}

export async function GET(req: NextRequest) {
  const auth = await gate();
  if ("error" in auth) return auth.error;
  const status = req.nextUrl.searchParams.get("status");
  const where = status && ["open", "done", "cancelled"].includes(status) ? { status } : {};
  const rows = await prisma.writeOffSheet.findMany({
    where,
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      _count: { select: { lines: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      reason: r.reason,
      reasonLabel: reasonLabel(r.reason, r.reasonText),
      actDate: r.actDate.toISOString(),
      createdAt: r.createdAt.toISOString(),
      author: fullName(r.author),
      lines: r._count.lines,
    })),
  });
}

export async function POST(req: NextRequest) {
  const auth = await gate();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  try {
    const sheet = await createWriteOffSheet(auth.session.user.id, body);
    return NextResponse.json({ id: sheet.id, number: sheet.number });
  } catch (e) {
    return fail(e);
  }
}

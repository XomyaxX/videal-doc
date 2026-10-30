import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { fmtDateTime, officeYmd } from "@/lib/dates";
import { fullName } from "@/lib/names";
import { USER_SAFE_SELECT } from "@/lib/user-public";
import { parseRemoteLogFilters, remoteLogWhere, REMOTE_ACTION_LABEL, REMOTE_LOG_LIMIT } from "@/lib/remote-log";

function cell(s: string) {
  return s.replace(/\t/g, " ").replace(/\r?\n/g, " ").trim();
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.audit")) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const { userId, q, action } = parseRemoteLogFilters({
    user: req.nextUrl.searchParams.get("user") || "",
    q: req.nextUrl.searchParams.get("q") || "",
    action: req.nextUrl.searchParams.get("action") || "",
  });
  const rows = await prisma.auditLog.findMany({
    where: remoteLogWhere({ userId, q, action }),
    include: { user: { select: USER_SAFE_SELECT } },
    orderBy: { createdAt: "desc" },
    take: REMOTE_LOG_LIMIT,
  });
  const who = userId && rows[0]?.user ? fullName(rows[0].user) : userId ? "выбранный сотрудник" : "все";
  const act = action ? REMOTE_ACTION_LABEL[action] || action : "все";
  const lines = [
    "Журнал дистанционных ООО «Видеаль Медиа»",
    `Выгрузка: ${fmtDateTime(new Date())}`,
    `Фильтр: ${who}; действие: ${act}${q ? `; поиск: ${q}` : ""}`,
    `Записей: ${rows.length} (лимит ${REMOTE_LOG_LIMIT})`,
    "",
    ["Когда", "Кто", "IP", "Действие", "Детали"].join("\t"),
    ...rows.map((r) =>
      [
        fmtDateTime(r.createdAt),
        r.user ? fullName(r.user) : "—",
        r.ip || "—",
        REMOTE_ACTION_LABEL[r.action] || r.action,
        r.details || "",
      ]
        .map(cell)
        .join("\t"),
    ),
  ];
  const name = `zhurnal-distancionnyh-${officeYmd()}.txt`;
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(`журнал-дистанционных-${officeYmd()}.txt`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

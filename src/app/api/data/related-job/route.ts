import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { auditRemote, auditRequestIp } from "@/lib/audit";
import { abortRelatedJob, getRelatedJob, publicJob, startRelatedJob } from "@/lib/related-zip-job";
import { canViewData, normalizeRel } from "@/lib/share-data";

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { p?: string };
  let rel = "";
  try {
    rel = normalizeRel(body.p || req.nextUrl.searchParams.get("p") || "");
  } catch {
    return NextResponse.json({ error: "Некорректный путь" }, { status: 400 });
  }
  if (!rel) return NextResponse.json({ error: "Нет файла" }, { status: 400 });
  const job = await startRelatedJob({ userId: session.user.id, rel });
  await auditRemote({
    user: session.user,
    action: "data.related.zip",
    entity: "data",
    entityId: rel.slice(0, 200),
    details: rel,
    ip: auditRequestIp(req),
    throttle: false,
  });
  return NextResponse.json(publicJob(job));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  const job = id ? getRelatedJob(id, session.user.id) : null;
  if (!job) return NextResponse.json({ error: "Нет задания" }, { status: 404 });
  return NextResponse.json(publicJob(job));
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const id = (req.nextUrl.searchParams.get("id") || "").trim();
  if (!id) return NextResponse.json({ error: "Нет задания" }, { status: 400 });
  await abortRelatedJob(id, session.user.id);
  return NextResponse.json({ ok: true });
}

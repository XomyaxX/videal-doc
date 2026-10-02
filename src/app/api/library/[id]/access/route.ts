import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit, auditRequestIp } from "@/lib/audit";
import { canManageLibrary, getLibraryAcl, listLibraryAclPeople, setLibraryAcl } from "@/lib/library";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Доступ настраивает руководство" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const [acl, people] = await Promise.all([getLibraryAcl(id), listLibraryAclPeople()]);
    return NextResponse.json({
      restricted: acl.restricted,
      userIds: acl.userIds,
      title: acl.item.title,
      isFolder: acl.item.kind === "folder",
      people,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Нет";
    return NextResponse.json({ error: msg }, { status: msg === "Нет блока" ? 404 : 400 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Доступ настраивает руководство" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const userIds = Array.isArray(body?.userIds) ? body.userIds.map(String) : [];
  try {
    const row = await setLibraryAcl(id, userIds);
    await audit({
      userId: session.user.id,
      action: row.restricted ? "library.acl.set" : "library.acl.clear",
      entity: "library",
      entityId: id,
      details: row.restricted ? `${row.title}: ${row.userIds.length}` : row.title,
      ip: auditRequestIp(req),
    });
    return NextResponse.json({ ok: true, restricted: row.restricted, userIds: row.userIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Не удалось";
    return NextResponse.json({ error: msg }, { status: msg === "Нет блока" ? 404 : 400 });
  }
}

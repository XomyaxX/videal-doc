import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit, auditRequestIp } from "@/lib/audit";
import { canManageLibrary, setLibraryShare } from "@/lib/library";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Ссылку включает руководство" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const enabled = Boolean(body?.enabled);
  try {
    const row = await setLibraryShare(id, {
      enabled,
      download: body?.download == null ? undefined : Boolean(body.download),
      edit: body?.edit == null ? undefined : Boolean(body.edit),
      create: body?.create == null ? undefined : Boolean(body.create),
    });
    await audit({
      userId: session.user.id,
      action: enabled ? "library.share.on" : "library.share.off",
      entity: "library",
      entityId: id,
      details: row.title,
      ip: auditRequestIp(req),
    });
    return NextResponse.json({
      ok: true,
      shareEnabled: row.shareEnabled,
      shareToken: row.shareEnabled ? row.shareToken : "",
      shareDownload: row.shareDownload,
      shareEdit: row.shareEdit,
      shareCreate: row.shareCreate,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Не удалось" }, { status: 400 });
  }
}

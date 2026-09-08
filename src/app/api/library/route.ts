import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  canManageLibrary,
  canViewLibrary,
  libraryKindOk,
  saveLibraryItem,
  serializeLibrary,
} from "@/lib/library";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewLibrary(session.user)) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  const kind = req.nextUrl.searchParams.get("kind") || "";
  const rows = await prisma.libraryItem.findMany({
    where: {
      deletedAt: null,
      ...(kind && libraryKindOk(kind) ? { kind } : {}),
      ...(q
        ? {
            OR: [
              { title: { contains: q } },
              { description: { contains: q } },
              { originalName: { contains: q } },
              { files: { some: { originalName: { contains: q } } } },
            ],
          }
        : {}),
    },
    include: {
      author: { select: { lastName: true, firstName: true, middleName: true } },
      files: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ rows: rows.map(serializeLibrary) });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || !canManageLibrary(session.user)) {
    return NextResponse.json({ error: "Добавлять файлы может только руководство" }, { status: 403 });
  }
  const settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
  const form = await req.formData();
  const rawFiles = [
    ...form.getAll("files"),
    ...form.getAll("file"),
  ].filter((f): f is File => f instanceof File && f.size > 0);
  if (rawFiles.length === 0) {
    return NextResponse.json({ error: "Приложите файлы" }, { status: 400 });
  }
  const preview = form.get("preview");
  try {
    const files = [];
    for (const file of rawFiles) {
      files.push({
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName: file.name,
        mime: file.type,
      });
    }
    const row = await saveLibraryItem({
      user: session.user,
      title: String(form.get("title") || ""),
      kind: String(form.get("kind") || ""),
      description: String(form.get("description") || ""),
      files,
      preview:
        preview instanceof File && preview.size > 0
          ? {
              buffer: Buffer.from(await preview.arrayBuffer()),
              originalName: preview.name,
              mime: preview.type,
            }
          : null,
      maxBytes: Math.max(settings?.maxUploadMb || 32, 250) * 1024 * 1024,
    });
    return NextResponse.json({ id: row.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка" }, { status: 400 });
  }
}

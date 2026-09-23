import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requireMeetAccess } from "@/lib/meet";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const { id } = await ctx.params;
  const meet = await requireMeetAccess(session.user, id);
  if (!meet) return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  const kind = req.nextUrl.searchParams.get("kind") === "txt" ? "txt" : "md";
  const body = kind === "txt" ? meet.transcript || meet.summaryMarkdown : meet.summaryMarkdown || meet.transcript;
  if (!body) return NextResponse.json({ error: "Пока пусто" }, { status: 400 });
  const name = kind === "txt" ? "rasshifrovka.txt" : "svodka.md";
  return new NextResponse(body, {
    headers: {
      "Content-Type": kind === "txt" ? "text/plain; charset=utf-8" : "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}

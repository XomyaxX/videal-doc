import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { askValera, previewValera } from "@/lib/valera/ask";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const history = Array.isArray(body?.history) ? body.history : [];
  const question = String(body?.question || "");
  const result =
    body?.phase === "detail"
      ? await askValera(session.user, question, history, true)
      : previewValera(session.user, question);
  if ("error" in result && result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  }
  return NextResponse.json({ answer: result.answer });
}

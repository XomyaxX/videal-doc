import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { arriveJokeActive } from "@/lib/arrive-joke";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Нужно войти", { status: 401 });
  if (!arriveJokeActive()) return new NextResponse(null, { status: 404 });
  const abs = path.join(/* turbopackIgnore: true */ process.cwd(), "src", "lib", "arrive-joke.jpg");
  try {
    const st = await stat(/* turbopackIgnore: true */ abs);
    if (!st.isFile() || st.size < 32) return new NextResponse(null, { status: 404 });
    const node = createReadStream(/* turbopackIgnore: true */ abs);
    return new NextResponse(Readable.toWeb(node) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(st.size),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

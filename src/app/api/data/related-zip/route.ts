import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getRelatedJob, relatedJobFileResponse } from "@/lib/related-zip-job";
import { canViewData } from "@/lib/share-data";

export const maxDuration = 600;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !canViewData(session.user)) {
    return new NextResponse("Нет права", { status: 403 });
  }
  const id = (req.nextUrl.searchParams.get("job") || "").trim();
  const job = id ? getRelatedJob(id, session.user.id) : null;
  if (!job) return NextResponse.json({ error: "Нет задания" }, { status: 404 });
  return relatedJobFileResponse(job);
}

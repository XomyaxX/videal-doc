import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { requestOrigin } from "@/lib/origin";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const url = `${requestOrigin(req)}/login/2fa/scan`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  return NextResponse.json({ qr, url });
}

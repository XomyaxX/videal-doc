import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = [
  "/login",
  "/pc",
  "/api/pc",
  "/api/auth/login",
  "/api/auth/switch",
  "/api/auth/accounts",
  "/api/auth/2fa",
  "/api/push/vapid",
  "/meet/join",
  "/api/meet/guest",
  "/l",
  "/api/l",
  "/gate",
  "/qr",
  "/api/gate/board",
  "/api/gate/media",
  "/api/qr/board",
  "/api/qr/image",
  "/api/qr/media",
  "/api/qr/poster",
  "/api/qr/screen",
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-vd-path", pathname);
  const pass = () => NextResponse.next({ request: { headers: requestHeaders } });
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/icons") ||
    pathname === "/favicon.ico" ||
    pathname === "/sw.js" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/apple-touch-icon.png" ||
    pathname.startsWith("/api/health") ||
    pathname === "/api/office-beacon"
  ) {
    return pass();
  }
  const token = req.cookies.get("vd_session")?.value;
  const guest = req.cookies.get("vd_meet_guest")?.value;
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return pass();
  if (!token && guest && (pathname.startsWith("/api/meet/") || pathname === "/api/meet/ice")) return pass();
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return pass();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api/library|api/data|api/upload|api/files|api/chat/.+/blobs|api/meet/.+/files|api/meet/.+/recording|api/admin/gate-bg).*)",
  ],
};

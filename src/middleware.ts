import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth/login", "/api/auth/switch", "/api/auth/accounts", "/api/auth/2fa", "/api/push/vapid"];

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
  const isPublic = PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (isPublic) return pass();
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};

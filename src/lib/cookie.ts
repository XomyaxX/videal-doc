import type { NextRequest } from "next/server";

export function sessionCookieOpts(req?: NextRequest, days = 30) {
  const proto = req?.headers.get("x-forwarded-proto") || "";
  const secure = process.env.COOKIE_SECURE === "1" || proto.includes("https");
  const n = Math.min(90, Math.max(1, Math.round(days)));
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * n,
    secure,
  };
}

export function deviceCookieOpts(req?: NextRequest) {
  return {
    ...sessionCookieOpts(req),
    maxAge: 60 * 60 * 24 * 400,
  };
}

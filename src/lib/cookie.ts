import type { NextRequest } from "next/server";

export function sessionCookieOpts(req?: NextRequest) {
  const proto = req?.headers.get("x-forwarded-proto") || "";
  const secure = process.env.COOKIE_SECURE === "1" || proto.includes("https");
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure,
  };
}

export function deviceCookieOpts(req?: NextRequest) {
  return {
    ...sessionCookieOpts(req),
    maxAge: 60 * 60 * 24 * 400,
  };
}

import type { NextRequest } from "next/server";

export function requestOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "www.videal-doc.ru";
  const proto =
    req.headers.get("x-forwarded-proto") || (host.includes("localhost") || host.startsWith("192.168.") ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function originHost(origin: string) {
  try {
    return new URL(origin).host;
  } catch {
    return "";
  }
}

export function safeNext(raw: string | null | undefined) {
  if (!raw) return "";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "";
  return raw;
}

export function deviceNameFromUa(ua: string) {
  const u = ua || "";
  if (/iPhone/i.test(u)) return "iPhone";
  if (/iPad/i.test(u)) return "iPad";
  if (/Android/i.test(u)) return "Android";
  if (/Windows/i.test(u)) return "Windows";
  if (/Mac OS|Macintosh/i.test(u)) return "Mac";
  if (/Linux/i.test(u)) return "Linux";
  return "Устройство";
}

export function devicePlatformFromUa(ua: string) {
  const u = ua || "";
  if (/iPhone|iPad|iPod/i.test(u)) return "ios";
  if (/Android/i.test(u)) return "android";
  return "web";
}

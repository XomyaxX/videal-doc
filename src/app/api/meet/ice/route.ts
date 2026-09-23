import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { guestFromCookie } from "@/lib/meet-guest";

export async function GET() {
  const session = await getSession();
  const guest = session ? null : await guestFromCookie();
  if (!session && !guest) return NextResponse.json({ error: "Нужно войти" }, { status: 401 });
  const iceServers: { urls: string | string[]; username?: string; credential?: string }[] = [
    { urls: "stun:stun.l.google.com:19302" },
  ];
  const urls = (process.env.TURN_URLS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const username = process.env.TURN_USER || "";
  const credential = process.env.TURN_PASS || "";
  if (urls.length && username && credential) {
    iceServers.push({ urls, username, credential });
  }
  return NextResponse.json({ iceServers });
}

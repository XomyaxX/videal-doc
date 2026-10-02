import { randomBytes, timingSafeEqual } from "crypto";
import QRCode from "qrcode";
import type { NextRequest } from "next/server";
import { prisma } from "./prisma";
import { requestOrigin } from "./origin";
import { gateBgMeta } from "./gate-bg";

export const GATE_SCREEN_URL = "https://videal-doc.ru/qr";

export const GATE_TTL_MS = 2 * 60 * 60 * 1000;

function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function gatePublicOrigin(req: NextRequest) {
  const origin = requestOrigin(req);
  if (origin.includes("videal-doc.ru")) return origin;
  return "https://www.videal-doc.ru";
}

export async function gateBoardUrl() {
  return GATE_SCREEN_URL;
}

export async function openGateToken() {
  const row = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { gateToken: true, gateExpiresAt: true },
  });
  const now = Date.now();
  if (row?.gateToken && row.gateExpiresAt && row.gateExpiresAt.getTime() > now + 15_000) {
    return { token: row.gateToken, expiresAt: row.gateExpiresAt };
  }
  const token = randomBytes(18).toString("base64url");
  const expiresAt = new Date(now + GATE_TTL_MS);
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default", gateToken: token, gateExpiresAt: expiresAt },
    update: { gateToken: token, gateExpiresAt: expiresAt },
  });
  return { token, expiresAt };
}

export async function gateKeyOk(key: string) {
  const row = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { gateKey: true },
  });
  if (!row?.gateKey || !sameSecret(row.gateKey, key.trim())) return false;
  return true;
}

export async function currentGate(key: string) {
  if (!(await gateKeyOk(key))) return null;
  return openGateToken();
}

export async function gateScreenPayload(req: NextRequest) {
  const gate = await openGateToken();
  const url = `${gatePublicOrigin(req)}/arrive?t=${encodeURIComponent(gate.token)}`;
  const [qr, media] = await Promise.all([gateQrDataUrl(url), gateBgMeta()]);
  return {
    qr,
    expiresAt: gate.expiresAt.toISOString(),
    media: media ? { kind: media.kind, name: media.name, v: media.v } : null,
  };
}

export async function gateTokenValid(token: string) {
  const raw = token.trim();
  if (raw.length < 16) return false;
  const row = await prisma.appSettings.findUnique({
    where: { id: "default" },
    select: { gateToken: true, gateExpiresAt: true },
  });
  if (!row?.gateToken || !row.gateExpiresAt) return false;
  if (row.gateExpiresAt.getTime() <= Date.now()) return false;
  return sameSecret(row.gateToken, raw);
}

const QR_OPTS = { margin: 2, width: 480, color: { dark: "#16324f", light: "#ffffff" } };

export async function gateQrDataUrl(arriveUrl: string) {
  return QRCode.toDataURL(arriveUrl, QR_OPTS);
}

export async function gateQrPng(arriveUrl: string) {
  return QRCode.toBuffer(arriveUrl, { ...QR_OPTS, type: "png" });
}

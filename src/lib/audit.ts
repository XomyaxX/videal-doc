import type { NextRequest } from "next/server";
import { prisma } from "./prisma";

const THROTTLE_MS = 5 * 60 * 1000;
const recent = new Map<string, number>();

export function isRemoteRole(roleCode: string) {
  return roleCode === "remote";
}

export function auditRequestIp(req: NextRequest) {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const fwd = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fwd[0] || "";
}

export async function audit(opts: {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ip?: string;
}) {
  await prisma.auditLog.create({
    data: {
      userId: opts.userId || null,
      action: opts.action,
      entity: opts.entity,
      entityId: opts.entityId || "",
      details: (opts.details || "").slice(0, 2000),
      ip: opts.ip || "",
    },
  });
}

export async function auditRemote(opts: {
  user: { id: string; roleCode: string };
  action: string;
  entity: string;
  entityId?: string;
  details?: string;
  ip?: string;
  throttle?: boolean;
}) {
  if (!isRemoteRole(opts.user.roleCode)) return;
  if (opts.throttle !== false) {
    const key = `${opts.user.id}:${opts.action}:${opts.entity}:${opts.entityId || ""}`;
    const now = Date.now();
    const prev = recent.get(key) || 0;
    if (now - prev < THROTTLE_MS) return;
    recent.set(key, now);
    if (recent.size > 4000) {
      for (const [k, t] of recent) {
        if (now - t > THROTTLE_MS) recent.delete(k);
      }
    }
  }
  await audit({
    userId: opts.user.id,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    details: opts.details,
    ip: opts.ip,
  });
}

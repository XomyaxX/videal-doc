import { prisma } from "./prisma";

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

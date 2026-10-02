import { prisma } from "@/lib/prisma";
import { fullName } from "@/lib/names";
import { officeYmd } from "@/lib/dates";
import type { AssignmentPdfData } from "./assignment";

export function toRoman(n: number) {
  const pairs: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = Math.max(1, Math.floor(n));
  let out = "";
  for (const [v, g] of pairs) {
    while (rest >= v) {
      out += g;
      rest -= v;
    }
  }
  return out;
}

function ymdParts(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return { y: m[1], mo: Number(m[2]), d: Number(m[3]) };
}

export function formatOrderDate(ymd: string) {
  const p = ymdParts(ymd);
  if (!p) return ymd;
  return `${String(p.d).padStart(2, "0")}.${String(p.mo).padStart(2, "0")}.${p.y}`;
}

function signName(user: { lastName: string; firstName: string; middleName?: string | null }) {
  const i = user.firstName ? `${user.firstName[0].toUpperCase()}.` : "";
  const m = user.middleName ? `${user.middleName[0].toUpperCase()}.` : "";
  return `${i}${m} ${user.lastName}`.trim();
}

function itemTitle(it: { name: string; pcHost: string }) {
  const host = it.pcHost.trim();
  if (host && !it.name.includes(host)) return `${it.name} (${host})`;
  return it.name;
}

export async function loadAssignmentPdfData(opts: { orderNo?: string; ymd?: string }): Promise<AssignmentPdfData> {
  const ymd = opts.ymd && ymdParts(opts.ymd) ? opts.ymd : officeYmd();
  const orderNo = (opts.orderNo || "").trim().slice(0, 24) || "___";
  const items = await prisma.inventoryItem.findMany({
    where: { deletedAt: null, userId: { not: null } },
    include: {
      user: {
        select: {
          id: true,
          lastName: true,
          firstName: true,
          middleName: true,
          deletedAt: true,
          position: { select: { name: true } },
        },
      },
    },
    orderBy: [{ invNo: "asc" }, { name: "asc" }],
  });
  type Bucket = {
    lastName: string;
    firstName: string;
    fullName: string;
    position: string;
    signName: string;
    lines: { invNo: string; name: string; qty: number }[];
  };
  const byUser = new Map<string, Bucket>();
  for (const it of items) {
    const u = it.user;
    if (!u || u.deletedAt) continue;
    let bucket = byUser.get(u.id);
    if (!bucket) {
      bucket = {
        lastName: u.lastName,
        firstName: u.firstName,
        fullName: fullName(u),
        position: u.position?.name || "",
        signName: signName(u),
        lines: [],
      };
      byUser.set(u.id, bucket);
    }
    bucket.lines.push({
      invNo: it.invNo || "",
      name: itemTitle(it),
      qty: it.qty || 1,
    });
  }
  const groups = Array.from(byUser.values())
    .sort((a, b) => a.lastName.localeCompare(b.lastName, "ru") || a.firstName.localeCompare(b.firstName, "ru"))
    .map((g, i) => ({
      roman: toRoman(i + 1),
      fullName: g.fullName,
      position: g.position,
      signName: g.signName,
      lines: g.lines.map((line, n) => ({ n: n + 1, ...line })),
    }));
  return {
    orderNo,
    orderDate: formatOrderDate(ymd),
    groups,
  };
}

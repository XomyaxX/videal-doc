import { rubToKopecks } from "./money";

export type ParsedReceipt = {
  qrRaw: string;
  occurredAt: Date | null;
  amount: number;
  fn: string;
  fd: string;
  fp: string;
  nFlag: string;
  merchant: string;
  merchantInn: string;
};

function parseQuery(raw: string): Record<string, string> {
  const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw;
  const out: Record<string, string> = {};
  for (const part of query.split("&")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = decodeURIComponent(part.slice(0, eq)).trim().toLowerCase();
    const value = decodeURIComponent(part.slice(eq + 1).replace(/\+/g, " ")).trim();
    out[key] = value;
  }
  return out;
}

function parseFnsTime(value: string): Date | null {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$/);
  if (!m) return null;
  const date = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] ?? "0"),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseFnsQr(raw: string): ParsedReceipt | null {
  const text = raw.trim();
  if (!text) return null;
  const params = parseQuery(text);
  const fn = params.fn ?? "";
  const fd = params.i ?? params.fd ?? "";
  const fp = params.fp ?? "";
  const sum = params.s ?? params.sum ?? "";
  const t = params.t ?? "";
  if (!fn && !fd && !fp && !sum && !t) return null;
  return {
    qrRaw: text,
    occurredAt: t ? parseFnsTime(t) : null,
    amount: sum ? rubToKopecks(sum) : 0,
    fn,
    fd,
    fp,
    nFlag: params.n ?? "",
    merchant: params.n ?? "",
    merchantInn: params.inn ?? "",
  };
}

export function receiptFingerprint(r: { fn: string; fd: string; fp: string }): string | null {
  if (!r.fn || !r.fd || !r.fp) return null;
  return `${r.fn}:${r.fd}:${r.fp}`;
}

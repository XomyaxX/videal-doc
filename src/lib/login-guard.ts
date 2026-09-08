const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

type Bucket = { fails: number; firstAt: number; lockedUntil: number };

const buckets = new Map<string, Bucket>();

function prune(now: number) {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) {
    if (b.lockedUntil < now && now - b.firstAt > WINDOW_MS) buckets.delete(k);
  }
}

function hit(key: string, now: number): Bucket {
  const cur = buckets.get(key);
  if (!cur || (cur.lockedUntil > 0 && cur.lockedUntil <= now) || (cur.lockedUntil === 0 && now - cur.firstAt > WINDOW_MS)) {
    const fresh = { fails: 0, firstAt: now, lockedUntil: 0 };
    buckets.set(key, fresh);
    return fresh;
  }
  return cur;
}

export function loginBlocked(ip: string, login: string): string | null {
  const now = Date.now();
  prune(now);
  for (const key of [`ip:${ip || "unknown"}`, `login:${login.trim().toLowerCase()}`]) {
    const b = buckets.get(key);
    if (b && b.lockedUntil > now) {
      const min = Math.max(1, Math.ceil((b.lockedUntil - now) / 60000));
      return `Слишком много попыток. Подождите ${min} мин.`;
    }
  }
  return null;
}

export function loginFailed(ip: string, login: string) {
  const now = Date.now();
  for (const key of [`ip:${ip || "unknown"}`, `login:${login.trim().toLowerCase()}`]) {
    const b = hit(key, now);
    b.fails += 1;
    if (b.fails >= MAX_FAILS) b.lockedUntil = now + WINDOW_MS;
  }
}

export function loginOk(ip: string, login: string) {
  buckets.delete(`ip:${ip || "unknown"}`);
  buckets.delete(`login:${login.trim().toLowerCase()}`);
}

export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  prune(now);
  const b = hit(`rl:${key}`, now);
  if (b.lockedUntil > now) return false;
  b.fails += 1;
  if (b.fails >= max) b.lockedUntil = now + windowMs;
  return b.fails <= max;
}

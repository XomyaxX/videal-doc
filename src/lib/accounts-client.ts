export type SavedAccount = {
  userId: string;
  login: string;
  fullName: string;
  roleName: string;
};

const PIN_KEY = "vd_pin";
const PIN_SALT_KEY = "vd_pin_salt";

function bytesToHex(arr: ArrayBuffer | Uint8Array) {
  const a = arr instanceof Uint8Array ? arr : new Uint8Array(arr);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text: string) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(hash);
}

export function getDevicePin(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(PIN_KEY);
}

export async function setDevicePin(pin: string) {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  const hex = await sha256Hex(`${salt}:${pin}`);
  localStorage.setItem(PIN_SALT_KEY, salt);
  localStorage.setItem(PIN_KEY, hex);
}

export function clearDevicePin() {
  localStorage.removeItem(PIN_KEY);
  localStorage.removeItem(PIN_SALT_KEY);
}

export async function checkDevicePin(pin: string) {
  const stored = getDevicePin();
  if (!stored) return true;
  const salt = localStorage.getItem(PIN_SALT_KEY);
  if (salt) return (await sha256Hex(`${salt}:${pin}`)) === stored;
  const legacy = await sha256Hex(pin);
  if (legacy !== stored) return false;
  await setDevicePin(pin);
  return true;
}

export async function fetchDeviceAccounts(): Promise<SavedAccount[]> {
  const res = await fetch("/api/auth/accounts");
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.accounts) ? data.accounts : [];
}

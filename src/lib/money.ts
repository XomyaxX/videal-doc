export function rubToKopecks(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    return Math.round(value * 100);
  }
  const normalized = value.replace(/\s/g, "").replace(",", ".").trim();
  if (!normalized) return 0;
  const num = Number(normalized);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function kopecksToRub(kopecks: number): string {
  const sign = kopecks < 0 ? "-" : "";
  const abs = Math.abs(Math.round(kopecks));
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  return `${sign}${rub}.${kop.toString().padStart(2, "0")}`;
}

export function formatMoney(kopecks: number): string {
  const sign = kopecks < 0 ? "−" : "";
  const abs = Math.abs(Math.round(kopecks));
  const rub = Math.floor(abs / 100);
  const kop = abs % 100;
  const grouped = rub.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped},${kop.toString().padStart(2, "0")} ₽`;
}

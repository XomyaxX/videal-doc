const PLACE =
  /планета|кабинет|мир\b|комната|пещер|площадк|локаци/i;

export function isLocationAssetName(name: string) {
  const n = (name || "").replace(/\s+/g, " ").trim();
  if (!n) return false;
  if (/локаци/i.test(n)) return true;
  if (/^\d+(\.\d+)*\./.test(n) && PLACE.test(n)) return true;
  return false;
}

export function reclassifyAssetKind(name: string, kind: string): "character" | "location" | "prop" {
  if (kind === "character") return "character";
  return isLocationAssetName(name) ? "location" : "prop";
}

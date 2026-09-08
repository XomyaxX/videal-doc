import { parseUrgency, type Urgency } from "./notify-urgency";

export function vibratePattern(level: Urgency): number[] {
  if (level === "urgent") return [220, 80, 220, 80, 400];
  if (level === "info") return [80];
  return [140, 70, 140];
}

export function isPhoneClient() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

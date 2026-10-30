import { OFFICE_TZ, officeYmd } from "./dates";

export const ARRIVE_JOKE_YMD = "2026-10-22";
export const ARRIVE_JOKE_FROM = "09:00";
export const ARRIVE_JOKE_TO = "11:00";

export function officeHm(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === "hour")?.value || "00";
  const minute = parts.find((p) => p.type === "minute")?.value || "00";
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** 22.10 по Омску, с 9:00 до 11:00. */
export function arriveJokeActive(d = new Date()) {
  if (officeYmd(d) !== ARRIVE_JOKE_YMD) return false;
  const hm = officeHm(d);
  return hm >= ARRIVE_JOKE_FROM && hm < ARRIVE_JOKE_TO;
}

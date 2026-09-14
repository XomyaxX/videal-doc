export const GENDER_LABEL: Record<"m" | "f", string> = {
  m: "Мужской",
  f: "Женский",
};

export const GENDER_GROUP: Record<"m" | "f", string> = {
  m: "Мужчины",
  f: "Женщины",
};

const BY_LOGIN: Record<string, "m" | "f"> = {
  boyarenok: "f",
  demidovich: "f",
  lyudmila: "f",
  rebro: "f",
  tochanskaya: "f",
  rulko: "f",
  novikova: "f",
  propastina: "f",
  balova: "f",
  belyaeva: "f",
  chetverikova: "f",
  zimareva: "f",
  "girsov.va": "m",
  kozlov: "m",
  laptev: "m",
  khozyainov: "m",
  ermilov: "m",
  "ermilov.mv": "m",
  mitrofanov: "m",
  radle: "m",
  katunin: "m",
  koropets: "m",
  balov: "m",
};

const WOMEN = new Set([
  "евгения",
  "ксения",
  "людмила",
  "ева",
  "екатерина",
  "виктория",
  "дарья",
  "полина",
  "ирина",
  "арина",
  "мария",
  "анна",
  "ольга",
  "наталья",
  "елена",
  "юлия",
  "александра",
  "татьяна",
  "светлана",
]);

const MEN = new Set([
  "валерий",
  "венедикт",
  "александр",
  "максим",
  "дмитрий",
  "михаил",
  "тимофей",
  "алексей",
  "илья",
  "павел",
  "андрей",
  "сергей",
  "иван",
  "николай",
  "владимир",
  "евгений",
  "артём",
  "артем",
]);

export function parseGender(raw: unknown): "m" | "f" | "" {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "m" || s === "f") return s;
  return "";
}

export function inferGender(opts: { login?: string | null; firstName?: string | null; middleName?: string | null }): "m" | "f" | "" {
  const login = (opts.login || "").trim().toLowerCase();
  if (BY_LOGIN[login]) return BY_LOGIN[login];
  const mid = (opts.middleName || "").trim().toLowerCase();
  if (/(овна|евна|ична|инична)$/.test(mid)) return "f";
  if (/(ович|евич|ьич)$/.test(mid)) return "m";
  const first = (opts.firstName || "").trim().toLowerCase();
  if (WOMEN.has(first)) return "f";
  if (MEN.has(first)) return "m";
  return "";
}

export function genderLabel(g: string) {
  if (g === "m" || g === "f") return GENDER_LABEL[g];
  return "не указан";
}

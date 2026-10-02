export function fullName(user: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [user.lastName, user.firstName, user.middleName].filter(Boolean).join(" ").trim();
}

export function shortName(user: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  const i = user.firstName ? `${user.firstName[0]}.` : "";
  const m = user.middleName ? `${user.middleName[0]}.` : "";
  return `${user.lastName} ${i}${m}`.trim();
}

/** Как в заявлении: «Балов ПА» */
export function shortNamePlain(user: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  const i = user.firstName ? user.firstName[0].toUpperCase() : "";
  const m = user.middleName ? user.middleName[0].toUpperCase() : "";
  return `${user.lastName} ${i}${m}`.trim();
}

export function initials(user: { lastName: string; firstName: string }): string {
  return `${user.lastName[0] ?? ""}${user.firstName[0] ?? ""}`.toUpperCase();
}

const LOGIN_LETTERS: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/** Логин из фамилии: Митрохина → mitrokhina. Х пишется как kh. */
export function loginStem(lastName: string): string {
  let out = "";
  for (const ch of lastName.trim().toLowerCase()) {
    if (LOGIN_LETTERS[ch] !== undefined) out += LOGIN_LETTERS[ch];
    else if (ch >= "a" && ch <= "z") out += ch;
    else if (ch >= "0" && ch <= "9") out += ch;
    else if (ch === "-" || ch === "_") out += "-";
  }
  out = out.replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
  return (out || "user").slice(0, 24);
}

type NameBits = { lastName: string; firstName: string; middleName?: string | null };

export function pairNames(a?: NameBits | null, b?: NameBits | null, fmt: (u: NameBits) => string = shortName): string {
  if (a && b) return `${fmt(a)} + ${fmt(b)}`;
  if (a) return fmt(a);
  if (b) return fmt(b);
  return "не назначен";
}

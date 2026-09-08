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

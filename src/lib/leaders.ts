export function isLeaderPosition(name: string | null | undefined) {
  const n = (name || "").toLocaleLowerCase("ru");
  return n.includes("руководител") || n.includes("директор");
}

export function isLeaderRole(code: string | null | undefined, name?: string | null) {
  const roleName = (name || "").toLocaleLowerCase("ru");
  return code === "manager" || roleName === "руководитель";
}

export function isFundApprover(person: {
  position?: { name: string } | null;
  role?: { code: string; name?: string } | null;
}) {
  return isLeaderPosition(person.position?.name) || isLeaderRole(person.role?.code, person.role?.name);
}

export function isHrAddressee(person: {
  position?: { name: string } | null;
  role?: { code: string; name?: string } | null;
}) {
  const pos = (person.position?.name || "").toLocaleLowerCase("ru");
  const role = person.role?.code || "";
  if (isFundApprover(person)) return true;
  if (role === "admin" || role === "manager") return true;
  return pos.includes("директор") || pos.includes("художественн") || pos.includes("руководител");
}

export const ORG_REQUISITES = {
  name: "Общество с ограниченной ответственностью «Видеаль Медиа»",
  shortName: "ООО «Видеаль Медиа»",
  inn: "5503283435",
  kpp: "550301001",
  ogrn: "1265500004373",
  legalAddress: "644024, г. Омск, ул. Лермонтова, 4, кв. 6",
  actualAddress: "644099, г. Омск, ул. Фрунзе, д. 54",
  postalAddress: "644074, г. Омск, ул. Конева, д. 22 к.1, пом. 2П",
  bankName: "Филиал «Центральный» Банка ВТБ (ПАО)",
  bankBik: "044525411",
  bankAccount: "40702810990810021424",
  corrAccount: "30101810145250000411",
};

type OrgLike = {
  name?: string | null;
  shortName?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legalAddress?: string | null;
  actualAddress?: string | null;
  postalAddress?: string | null;
  bankName?: string | null;
  bankBik?: string | null;
  bankAccount?: string | null;
  corrAccount?: string | null;
} | null | undefined;

function val(org: OrgLike, key: keyof typeof ORG_REQUISITES): string {
  const raw = org?.[key];
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return ORG_REQUISITES[key];
}

export function orgNameFull(org?: OrgLike) {
  return val(org, "name");
}

export function orgNameShort(org?: OrgLike) {
  return val(org, "shortName");
}

export function orgCodesLine(org?: OrgLike) {
  const ogrn = val(org, "ogrn");
  const inn = val(org, "inn");
  const kpp = val(org, "kpp");
  return [
    ogrn ? `ОГРН ${ogrn}` : "",
    inn ? `ИНН ${inn}` : "",
    kpp ? `КПП ${kpp}` : "",
  ]
    .filter(Boolean)
    .join("  ");
}

export function orgLetterhead(org?: OrgLike): string[] {
  const legal = val(org, "legalAddress");
  const actual = val(org, "actualAddress");
  const postal = val(org, "postalAddress");
  const bank = val(org, "bankName");
  const account = val(org, "bankAccount");
  const bik = val(org, "bankBik");
  const corr = val(org, "corrAccount");
  const addresses = [
    legal ? `Юр.: ${legal}` : "",
    actual ? `Факт.: ${actual}` : "",
  ]
    .filter(Boolean)
    .join("   ");
  const bankLine = [
    bank ? `Банк: ${bank}` : "",
    account ? `р/с ${account}` : "",
    bik ? `БИК ${bik}` : "",
    corr ? `к/с ${corr}` : "",
  ]
    .filter(Boolean)
    .join("  ");
  return [
    orgNameFull(org),
    orgCodesLine(org),
    addresses,
    postal ? `Почт.: ${postal}` : "",
    bankLine,
  ].filter(Boolean);
}

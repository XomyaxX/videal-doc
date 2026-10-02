export type TmcMember = { role: string; name: string };

export function defaultTmcCommission(molName: string): TmcMember[] {
  return [
    { role: "Специалист АХО", name: "Балов П.А." },
    { role: "Специалист АХО", name: "Цвяк А.Н." },
    { role: "Бухгалтер", name: "Жлудова О.В." },
    { role: "Материально ответственное лицо", name: molName },
  ];
}

export function parseTmcCommission(raw: string, fallback: TmcMember[]): TmcMember[] {
  try {
    const v = JSON.parse(raw || "[]");
    if (!Array.isArray(v) || v.length === 0) return fallback;
    return v.map((x) => ({
      role: String(x?.role || "").slice(0, 120),
      name: String(x?.name || "").slice(0, 120),
    }));
  } catch {
    return fallback;
  }
}

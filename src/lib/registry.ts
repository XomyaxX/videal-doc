export const REGISTRY_DIR = {
  in: { label: "Входящее", tone: "wait" as const, prefix: "ВХ" },
  out: { label: "Исходящее", tone: "ok" as const, prefix: "ИСХ" },
};

export function registryDir(raw: string) {
  return raw === "out" ? REGISTRY_DIR.out : REGISTRY_DIR.in;
}

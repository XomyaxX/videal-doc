export const PERMISSIONS = [
  { code: "docs.view_own", name: "Свои документы" },
  { code: "docs.view_all", name: "Все документы" },
  { code: "docs.send", name: "Рассылать документы" },
  { code: "docs.manage", name: "Управлять документами" },
  { code: "users.view", name: "Смотреть сотрудников" },
  { code: "users.manage", name: "Управлять сотрудниками" },
  { code: "roles.manage", name: "Роли и уровни доступа" },
  { code: "org.edit", name: "Реквизиты организации" },
  { code: "scan.use", name: "Окно SCAN" },
  { code: "finance.create", name: "Создавать авансовые и финансы" },
  { code: "finance.approve", name: "Согласовывать финансы" },
  { code: "finance.view_all", name: "Все финансовые документы" },
  { code: "admin.audit", name: "Журнал действий" },
  { code: "admin.settings", name: "Настройки системы" },
  { code: "admin.backup", name: "Резервные копии" },
  { code: "catalogs.manage", name: "Отделы и должности" },
  { code: "prod.view", name: "Смотреть производство" },
  { code: "prod.work", name: "Свои производственные задачи" },
  { code: "prod.lead", name: "Руководить отделом (утверждать, назначать)" },
  { code: "prod.manage", name: "Всё производство и любые отделы" },
  { code: "requests.create", name: "Запросы на закупку" },
  { code: "requests.aho", name: "Очередь АХО" },
  { code: "hrdocs.create", name: "Заявления (отгул, объяснительная)" },
  { code: "hrdocs.review", name: "Входящие заявления" },
  { code: "archive.view", name: "Свой архив документов" },
  { code: "archive.view_all", name: "Архивы сотрудников" },
  { code: "presence.review", name: "Контроль прихода и ухода" },
  { code: "inventory.manage", name: "Инвентарь (правка АХО)" },
] as const;

export type PermissionCode = (typeof PERMISSIONS)[number]["code"];

export const ALL_PERMISSION_CODES: PermissionCode[] = PERMISSIONS.map((p) => p.code);

export const ROLE_PRESETS: Record<string, PermissionCode[]> = {
  superadmin: [...ALL_PERMISSION_CODES],
  admin: [
    "docs.view_own",
    "docs.view_all",
    "docs.send",
    "docs.manage",
    "users.view",
    "users.manage",
    "roles.manage",
    "org.edit",
    "scan.use",
    "finance.create",
    "finance.approve",
    "finance.view_all",
    "admin.audit",
    "admin.settings",
    "admin.backup",
    "catalogs.manage",
    "prod.view",
    "prod.work",
    "prod.lead",
    "prod.manage",
    "requests.create",
    "requests.aho",
    "hrdocs.create",
    "hrdocs.review",
    "archive.view",
    "archive.view_all",
    "presence.review",
    "inventory.manage",
  ],
  aho: [
    "docs.view_own",
    "docs.send",
    "scan.use",
    "finance.create",
    "finance.view_all",
    "requests.create",
    "requests.aho",
    "hrdocs.create",
    "archive.view",
    "archive.view_all",
    "inventory.manage",
  ],
  accountant: [
    "docs.view_own",
    "docs.view_all",
    "docs.send",
    "users.view",
    "scan.use",
    "finance.create",
    "finance.approve",
    "finance.view_all",
    "prod.view",
    "requests.create",
    "hrdocs.create",
    "archive.view",
    "archive.view_all",
  ],
  manager: [
    "docs.view_own",
    "docs.send",
    "users.view",
    "scan.use",
    "finance.create",
    "finance.approve",
    "finance.view_all",
    "prod.view",
    "prod.work",
    "prod.lead",
    "requests.create",
    "hrdocs.create",
    "hrdocs.review",
    "archive.view",
    "archive.view_all",
    "presence.review",
  ],
  employee: [
    "docs.view_own",
    "scan.use",
    "finance.create",
    "prod.view",
    "prod.work",
    "requests.create",
    "hrdocs.create",
    "archive.view",
  ],
};

export function parsePermissions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function hasPermission(raw: string, code: PermissionCode): boolean {
  const list = parsePermissions(raw);
  return list.includes("superadmin") || list.includes(code);
}

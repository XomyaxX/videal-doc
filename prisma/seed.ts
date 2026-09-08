import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";
import { ROLE_PRESETS } from "../src/lib/permissions";
import { ORG_REQUISITES } from "../src/lib/org";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  await prisma.appSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });

  const org = await prisma.organization.findFirst();
  if (!org) {
    await prisma.organization.create({
      data: {
        ...ORG_REQUISITES,
        directorTitle: "Генеральный директор",
        directorName: "Ермилов Михаил Владимирович",
      },
    });
  }

  const roleRows: Record<string, string> = {};
  const roles: { code: string; name: string; description: string }[] = [
    { code: "superadmin", name: "Суперадмин", description: "Полный доступ" },
    { code: "admin", name: "Администратор", description: "Сотрудники, документы, настройки" },
    { code: "accountant", name: "Бухгалтер", description: "Финансы и авансовые отчёты" },
    { code: "manager", name: "Руководитель", description: "Рассылки и согласование" },
    { code: "employee", name: "Сотрудник", description: "Ознакомление и свои документы" },
  ];
  for (const r of roles) {
    const preset = ROLE_PRESETS[r.code] ?? [];
    const existing = await prisma.role.findUnique({ where: { code: r.code } });
    let have: string[] = [];
    try {
      const parsed = existing ? JSON.parse(existing.permissions || "[]") : [];
      have = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      have = [];
    }
    const permissions = JSON.stringify(Array.from(new Set([...have, ...preset])));
    const row = await prisma.role.upsert({
      where: { code: r.code },
      create: {
        code: r.code,
        name: r.name,
        description: r.description,
        isSystem: true,
        permissions: JSON.stringify(preset),
      },
      update: {
        name: r.name,
        description: r.description,
        permissions,
      },
    });
    roleRows[r.code] = row.id;
  }

  const departments = ["Администрация", "Бухгалтерия", "Производство"];
  const depIds: Record<string, string> = {};
  for (const name of departments) {
    const existing = await prisma.department.findFirst({ where: { name, deletedAt: null } });
    const row = existing ?? (await prisma.department.create({ data: { name } }));
    depIds[name] = row.id;
  }

  const positions = ["Генеральный директор", "Руководитель", "Администратор", "Бухгалтер", "Менеджер", "Специалист"];
  const posIds: Record<string, string> = {};
  for (const name of positions) {
    const existing = await prisma.position.findFirst({ where: { name, deletedAt: null } });
    const row = existing ?? (await prisma.position.create({ data: { name } }));
    posIds[name] = row.id;
  }

  const templates = [
    { code: "ao1", name: "Авансовый отчёт (АО-1)", description: "Отчёт по подотчётным суммам", enabled: true },
    { code: "funds", name: "Запрос средств", description: "Служебная записка: руководитель согласует, бухгалтерия выплачивает", enabled: true },
    { code: "invoice", name: "Счёт на оплату", description: "Счёт контрагенту", enabled: false },
    { code: "act", name: "Акт выполненных работ", description: "Акт сдачи-приёмки", enabled: false },
    { code: "upd", name: "УПД", description: "Универсальный передаточный документ", enabled: false },
    { code: "payment", name: "Платёжное поручение", description: "Поручение в банк", enabled: false },
    { code: "proxy", name: "Доверенность", description: "Доверенность на получение ТМЦ", enabled: false },
    { code: "order", name: "Приказ", description: "Внутренний приказ", enabled: false },
  ];
  for (const t of templates) {
    await prisma.documentTemplate.upsert({
      where: { code: t.code },
      create: t,
      update: { name: t.name, description: t.description },
    });
  }

  const existingAdmin = await prisma.user.findUnique({ where: { login: "admin" } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        login: "admin",
        passwordHash: hashPassword("Videal2026!"),
        lastName: "Администратор",
        firstName: "Системы",
        middleName: "",
        phone: "",
        email: "",
        personnelNumber: "1",
        mustChangePassword: true,
        roleId: roleRows.superadmin,
        departmentId: depIds["Администрация"],
        positionId: posIds["Администратор"],
      },
    });
    console.log("Создана учётка admin / Videal2026! — смените пароль при первом входе.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

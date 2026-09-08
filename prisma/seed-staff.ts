import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function randomTempPassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function phoneRu(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  let n = d;
  if (n.length === 10) n = "7" + n;
  if (n.startsWith("8") && n.length === 11) n = "7" + n.slice(1);
  if (n.length === 11 && n.startsWith("7")) {
    return `+7 ${n.slice(1, 4)} ${n.slice(4, 7)}-${n.slice(7, 9)}-${n.slice(9, 11)}`;
  }
  return raw.trim();
}

function parseDate(raw: string): Date | null {
  const m = raw.trim().replace(/,/g, ".").replace(/\//g, ".").match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0));
}

const people: {
  login: string;
  lastName: string;
  firstName: string;
  middleName: string;
  phone: string;
  birth: string;
}[] = [
  { login: "boyarenok", lastName: "Бояренок", firstName: "Евгения", middleName: "Анатольевна", phone: "9131454795", birth: "03.01.2002" },
  { login: "kozlov", lastName: "Козлов", firstName: "Венедикт", middleName: "Вадимович", phone: "9237615755", birth: "16.05.2002" },
  { login: "mitrofanov", lastName: "Митрофанов", firstName: "Тимофей", middleName: "Николаевич", phone: "9045845061", birth: "27.01.2003" },
  { login: "laptev", lastName: "Лаптев", firstName: "Александр", middleName: "Владимирович", phone: "9293663959", birth: "12.02.2005" },
  { login: "demidovich", lastName: "Демидович", firstName: "Ксения", middleName: "Александровна", phone: "9994557975", birth: "11.12.2002" },
  { login: "tochanskaya", lastName: "Точанская", firstName: "Екатерина", middleName: "Евгеньевна", phone: "9136016970", birth: "13.07.2001" },
  { login: "novikova", lastName: "Новикова", firstName: "Дарья", middleName: "Дмитриевна", phone: "9136738394", birth: "06.09.2001" },
  { login: "rebro", lastName: "Ребро", firstName: "Ева", middleName: "Дмитриевна", phone: "9136697573", birth: "06.02.2005" },
  { login: "rulko", lastName: "Рулько", firstName: "Виктория", middleName: "Сергеевна", phone: "9088050956", birth: "17.10.2004" },
  { login: "zimareva", lastName: "Зимарёва", firstName: "Арина", middleName: "Григорьевна", phone: "9083191983", birth: "17.12.2003" },
  { login: "khozyainov", lastName: "Хозяинов", firstName: "Максим", middleName: "Андреевич", phone: "9963968127", birth: "20.08.1999" },
  { login: "radle", lastName: "Радле-Десятник", firstName: "Максим", middleName: "Константинович", phone: "9509512173", birth: "22.04.2000" },
  { login: "ermilov", lastName: "Ермилов", firstName: "Дмитрий", middleName: "Михайлович", phone: "", birth: "" },
  { login: "ermilov.mv", lastName: "Ермилов", firstName: "Михаил", middleName: "Владимирович", phone: "", birth: "" },
  { login: "propastina", lastName: "Пропастина", firstName: "Полина", middleName: "Сергеевна", phone: "", birth: "" },
];

async function main() {
  const role = await prisma.role.findUnique({ where: { code: "employee" } });
  if (!role) throw new Error("Нет роли employee — сначала npm run setup");
  const dept = await prisma.department.findFirst({ where: { name: "Офис", deletedAt: null } });
  const pos = await prisma.position.findFirst({ where: { name: "Специалист", deletedAt: null } });
  const created: { login: string; name: string; password: string }[] = [];

  for (const p of people) {
    const exists = await prisma.user.findUnique({ where: { login: p.login } });
    if (exists) {
      await prisma.user.update({
        where: { id: exists.id },
        data: {
          lastName: p.lastName,
          firstName: p.firstName,
          middleName: p.middleName,
          phone: phoneRu(p.phone),
          birthDate: p.birth ? parseDate(p.birth) : exists.birthDate,
          deletedAt: null,
          status: "active",
          passwordHash: hashPassword("Videal2026!"),
          mustChangePassword: true,
        },
      });
      created.push({
        login: p.login,
        name: `${p.lastName} ${p.firstName} ${p.middleName}`,
        password: "Videal2026!",
      });
      continue;
    }
    const temp = "Videal2026!";
    await prisma.user.create({
      data: {
        login: p.login,
        passwordHash: hashPassword(temp),
        lastName: p.lastName,
        firstName: p.firstName,
        middleName: p.middleName,
        phone: phoneRu(p.phone),
        birthDate: p.birth ? parseDate(p.birth) : null,
        mustChangePassword: true,
        roleId: role.id,
        departmentId: dept?.id ?? null,
        positionId: pos?.id ?? null,
      },
    });
    created.push({ login: p.login, name: `${p.lastName} ${p.firstName} ${p.middleName}`, password: temp });
  }

  if (created.length) {
    console.log("\nНовые учётки (временный пароль, сменить при входе):");
    for (const c of created) console.log(`${c.login}\t${c.password}\t${c.name}`);
  } else {
    console.log("Новых учёток нет, существующие обновлены.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

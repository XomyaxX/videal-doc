import { PrismaClient } from "@prisma/client";
import { randomBytes, scryptSync, randomUUID } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import path from "path";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function fileRoot() {
  return path.resolve(process.env.FILE_ROOT || path.join(process.cwd(), "data", "files"));
}

function miniPdf(title: string): Buffer {
  const safe = title.replace(/[()\\]/g, " ").slice(0, 80);
  const stream = `BT /F1 14 Tf 50 780 Td (${safe}) Tj ET`;
  const body = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length ${stream.length}>>stream
${stream}
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;
  return Buffer.from(body, "utf8");
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function saveFile(originalName: string, buffer: Buffer, mime: string, userId: string) {
  const id = randomUUID();
  const ext = path.extname(originalName) || (mime.includes("pdf") ? ".pdf" : ".png");
  const rel = `${id}${ext}`;
  const dir = fileRoot();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, rel), buffer);
  return prisma.storedFile.create({
    data: {
      id,
      originalName,
      mimeType: mime,
      size: buffer.length,
      path: rel,
      createdById: userId,
    },
  });
}

function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

async function main() {
  console.log("Чистим документы, финансы, календарь, уведомления…");
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.documentRecipient.deleteMany();
  await prisma.calendarParticipant.deleteMany();
  await prisma.fundRequestFile.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.fundRequest.deleteMany();
  await prisma.advanceReport.deleteMany();
  await prisma.document.deleteMany();
  await prisma.calendarEvent.deleteMany();
  await prisma.storedFile.deleteMany();
  await prisma.sequence.deleteMany();
  await rm(fileRoot(), { recursive: true, force: true });
  await mkdir(fileRoot(), { recursive: true });

  const adminRole = await prisma.role.findUnique({ where: { code: "admin" } });
  const managerRole = await prisma.role.findUnique({ where: { code: "manager" } });
  const employeeRole = await prisma.role.findUnique({ where: { code: "employee" } });
  if (!adminRole || !employeeRole) throw new Error("Сначала npm run setup");

  const dept = await prisma.department.findFirst({ where: { deletedAt: null } });
  let posLead = await prisma.position.findFirst({
    where: { deletedAt: null, name: { contains: "Руководител" } },
  });
  if (!posLead) {
    posLead = await prisma.position.create({ data: { name: "Руководитель" } });
  }
  const posSpec = await prisma.position.findFirst({ where: { deletedAt: null, name: "Специалист" } });

  const lyudmila = await prisma.user.upsert({
    where: { login: "lyudmila" },
    create: {
      login: "lyudmila",
      passwordHash: hashPassword("VidealDemo!"),
      lastName: "Иванова",
      firstName: "Людмила",
      middleName: "Игоревна",
      mustChangePassword: false,
      status: "active",
      roleId: adminRole.id,
      departmentId: dept?.id ?? null,
      positionId: posLead.id,
      phone: "",
      personnelNumber: "демо",
    },
    update: {
      passwordHash: hashPassword("VidealDemo!"),
      lastName: "Иванова",
      firstName: "Людмила",
      middleName: "Игоревна",
      mustChangePassword: false,
      status: "active",
      deletedAt: null,
      roleId: adminRole.id,
      positionId: posLead.id,
    },
  });

  const people = await prisma.user.findMany({
    where: { deletedAt: null, status: "active" },
    orderBy: { lastName: "asc" },
  });
  const others = people.filter((p) => p.id !== lyudmila.id);
  const author = others[0] || lyudmila;
  const staffA = others[1] || author;
  const staffB = others[2] || author;

  if (managerRole) {
    await prisma.user.updateMany({
      where: { id: { in: others.slice(0, 2).map((p) => p.id) } },
      data: { managerId: lyudmila.id },
    });
  }

  const orderPdf = await saveFile(
    "[демо] Приказ об охране труда.pdf",
    miniPdf("Prikaz ob ohrane truda — demo Videal.Doc"),
    "application/pdf",
    lyudmila.id,
  );
  const signPdf = await saveFile(
    "[демо] Положение о командировках.pdf",
    miniPdf("Polozhenie o komandirovkah — demo"),
    "application/pdf",
    lyudmila.id,
  );
  const apprPdf = await saveFile(
    "[демо] Служебная записка.pdf",
    miniPdf("Sluzhebnaya zapiska na soglasovanie — demo"),
    "application/pdf",
    lyudmila.id,
  );
  const receiptPng = await saveFile("[демо] чек.png", PNG, "image/png", author.id);

  const allIds = people.map((p) => p.id);

  const docAck = await prisma.document.create({
    data: {
      number: "ВД-2026-0001",
      title: "[демо] Приказ об охране труда",
      comment: "Прочитайте и поставьте галочку «ознакомился». Учебный документ.",
      requireAck: true,
      requireSignedReturn: false,
      requireApproval: false,
      remindDaily: false,
      dueAt: daysFromNow(5),
      authorId: lyudmila.id,
      originalFileId: orderPdf.id,
      recipients: {
        create: allIds.map((userId, i) => ({
          userId,
          viewedAt: i < 4 ? daysFromNow(-1) : null,
          ackedAt: i < 3 ? daysFromNow(-1) : null,
        })),
      },
    },
  });

  await prisma.document.create({
    data: {
      number: "ВД-2026-0002",
      title: "[демо] Положение о командировках",
      comment: "Распечатайте, подпишите, загрузите скан. Учебный документ.",
      requireAck: false,
      requireSignedReturn: true,
      requireApproval: false,
      remindDaily: false,
      dueAt: daysFromNow(7),
      authorId: lyudmila.id,
      originalFileId: signPdf.id,
      recipients: { create: [{ userId: lyudmila.id }, { userId: author.id }, { userId: staffA.id }] },
    },
  });

  const docAppr = await prisma.document.create({
    data: {
      number: "ВД-2026-0003",
      title: "[демо] Служебная записка на закупку",
      comment: "Нужно согласование руководителя. Учебный документ.",
      requireAck: false,
      requireSignedReturn: false,
      requireApproval: true,
      remindDaily: false,
      dueAt: daysFromNow(3),
      authorId: author.id,
      originalFileId: apprPdf.id,
      recipients: {
        create: [
          { userId: lyudmila.id, isApprover: true },
          { userId: author.id, isApprover: false },
        ],
      },
    },
  });

  await prisma.calendarEvent.create({
    data: {
      title: "[демо] Планёрка студии",
      body: "Короткое совещание: съёмки на неделю, дедлайны.",
      startsAt: daysFromNow(1),
      endsAt: new Date(daysFromNow(1).getTime() + 60 * 60 * 1000),
      allDay: false,
      color: "navy",
      authorId: lyudmila.id,
      participants: { create: [{ userId: lyudmila.id }, { userId: author.id }, { userId: staffA.id }] },
    },
  });
  await prisma.calendarEvent.create({
    data: {
      title: "[демо] Съёмка на площадке",
      body: "Выезд. Учебное событие.",
      startsAt: daysFromNow(3),
      endsAt: daysFromNow(3),
      allDay: true,
      color: "gold",
      authorId: author.id,
      participants: { create: [{ userId: lyudmila.id }, { userId: author.id }, { userId: staffB.id }] },
    },
  });

  await prisma.sequence.createMany({
    data: [
      { key: "doc:2026", value: 3 },
      { key: "zs:2026", value: 3 },
      { key: "ao:2026", value: 1 },
    ],
  });

  await prisma.fundRequest.create({
    data: {
      number: "ЗС-2026-0001",
      authorId: author.id,
      amount: 1250000,
      purpose: "[демо] Хозрасходы студии",
      details: "Бумага, батарейки, канцтовары. Учебная заявка на согласовании.",
      neededAt: daysFromNow(4),
      payee: `${author.lastName} ${author.firstName}`,
      managerId: lyudmila.id,
      status: "review",
    },
  });
  await prisma.fundRequest.create({
    data: {
      number: "ЗС-2026-0002",
      authorId: staffA.id,
      amount: 4800000,
      purpose: "[демо] Подписка на сервис 3D",
      details: "Годовая лицензия. Учебная заявка, согласована, ждёт выплату.",
      neededAt: daysFromNow(2),
      payee: `${staffA.lastName} ${staffA.firstName}`,
      managerId: lyudmila.id,
      managerAt: daysFromNow(-1),
      managerNote: "Согласовано (демо)",
      status: "to_pay",
    },
  });
  const paid = await prisma.fundRequest.create({
    data: {
      number: "ЗС-2026-0003",
      authorId: lyudmila.id,
      amount: 705000,
      purpose: "[демо] Наушники для 3D-отдела",
      details: "Выплачено. Нужен авансовый отчёт до 5-го числа.",
      neededAt: daysFromNow(-2),
      payee: "Иванова Людмила Игоревна",
      managerId: lyudmila.id,
      managerAt: daysFromNow(-3),
      managerNote: "Согласовано (демо)",
      accountantId: lyudmila.id,
      paidAt: daysFromNow(-2),
      status: "paid",
    },
  });

  const ao = await prisma.advanceReport.create({
    data: {
      number: "АО-2026-0001",
      userId: staffB.id,
      purpose: "[демо] Канцтовары",
      issuedAmount: 320000,
      status: "draft",
    },
  });
  await prisma.receipt.create({
    data: {
      reportId: ao.id,
      sourceFileId: receiptPng.id,
      amount: 185000,
      merchant: "[демо] Магазин канцтоваров",
      occurredAt: daysFromNow(-4),
      note: "без QR — учебная строка",
      fd: "42",
    },
  });

  await prisma.notification.createMany({
    data: [
      {
        userId: lyudmila.id,
        title: "Демо: документ на согласование",
        body: "[демо] Служебная записка на закупку",
        link: `/documents/${docAppr.id}`,
      },
      {
        userId: lyudmila.id,
        title: "Демо: запрос средств на согласовании",
        body: "ЗС-2026-0001 · Хозрасходы студии",
        link: "/funds",
      },
      {
        userId: lyudmila.id,
        title: "Демо: нужно отчитаться",
        body: `${paid.number} · наушники · авансовый до 5-го числа`,
        link: `/advances/new?funds=${paid.id}`,
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      userId: lyudmila.id,
      action: "demo.seed",
      entity: "system",
      details: "Загружен учебный контур для просмотра руководителем",
    },
  });

  console.log("Готово.");
  console.log("Демо-вход:  lyudmila");
  console.log("Пароль:     VidealDemo!");
  console.log("Адрес:      http://192.168.1.51");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from "@prisma/client";
import { sendMailToUser } from "../src/lib/mail";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ login: "zimareva" }, { lastName: { contains: "Зимар" } }],
    },
    select: { id: true, login: true, lastName: true, firstName: true, email: true },
  });
  if (!user) throw new Error("Зимарёва не найдена");

  const n = await prisma.notification.create({
    data: {
      userId: user.id,
      title: "Тестовое уведомление",
      body: "Проверка: так в Доке приходит колокольчик. Откройте «Уведомления».",
      link: "/notifications",
    },
  });

  let mail = "нет email";
  if (user.email) {
    const sent = await sendMailToUser({
      userId: user.id,
      subject: "Тестовое уведомление — Видеал.Док",
      text: "Это проверка. В Доке то же сообщение в колокольчике (уведомления).",
    });
    mail = sent.ok ? `письмо ok → ${user.email}` : `письмо: ${sent.error}`;
  }

  console.log("user", user.login, user.lastName, user.firstName);
  console.log("email", user.email || "(пусто)");
  console.log("notification", n.id);
  console.log("mail", mail);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

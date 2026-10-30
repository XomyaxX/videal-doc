import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Button, Card, PageHeader } from "@/components/ui";
import { fullName } from "@/lib/names";
import { fmtDate } from "@/lib/dates";
import { GuestNdaForm } from "./GuestNdaForm";

const COMPANY = `Общество с ограниченной ответственностью «Видеаль Медиа»
ОГРН 1265500004373, ИНН: 5503283435
адрес регистрации: 644024, г. Омск, ул. Лермонтова, 4, кв. 6
почтовый адрес: 644074, г. Омск, ул. Конева, д. 22/1, пом. 2П
фактический адрес: 644007, г. Омск, ул. Герцена, д. 49/1
Электронная почта: ermilov_07@mail.ru

Генеральный директор
М.В. Ермилов /_____________/`;

export default async function GuestNdaPage() {
  await requirePermission("users.manage");
  const recent = await prisma.guestNda.findMany({
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      fileId: true,
      createdAt: true,
    },
  });

  return (
    <div className="grid gap-4">
      <PageHeader
        title="NDA для гостя"
        subtitle="Гость не появляется в сотрудниках. Соглашение то же, что у штатных."
        actions={
          <Button href="/employees" variant="secondary">
            К сотрудникам
          </Button>
        }
      />
      <Card>
        <h2 className="font-serif text-xl text-navy">Сторона-1</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{COMPANY}</p>
        <p className="mt-3 text-sm text-muted">Эти реквизиты уже стоят в документе. Здесь заполняется только гость.</p>
      </Card>
      <Card>
        <h2 className="font-serif text-xl text-navy">Гость · сторона-2</h2>
        <div className="mt-4">
          <GuestNdaForm />
        </div>
      </Card>
      {recent.length ? (
        <Card>
          <h2 className="font-serif text-xl text-navy">Уже собранные</h2>
          <ul className="mt-3 divide-y divide-line">
            {recent.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-semibold text-navy">{fullName(row)}</div>
                  <div className="text-sm text-muted">{fmtDate(row.createdAt)}</div>
                </div>
                {row.fileId ? (
                  <Link href={`/api/files/${row.fileId}`} className="text-sm font-semibold text-navy hover:text-gold">
                    Скачать
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

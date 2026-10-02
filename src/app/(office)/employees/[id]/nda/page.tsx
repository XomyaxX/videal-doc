import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader } from "@/components/ui";
import { fullName, shortName } from "@/lib/names";
import { canEditUser } from "@/lib/role-guard";
import { parseNdaPassport } from "@/lib/nda";
import { NdaForm } from "./NdaForm";

const COMPANY = `Общество с ограниченной ответственностью «Видеаль Медиа»
ОГРН 1265500004373, ИНН: 5503283435
адрес регистрации: 644024, г. Омск, ул. Лермонтова, 4, кв. 6
почтовый адрес: 644074, г. Омск, ул. Конева, д. 22/1, пом. 2П
фактический адрес: 644007, г. Омск, ул. Герцена, д. 49/1
Электронная почта: ermilov_07@mail.ru

Генеральный директор
М.В. Ермилов /_____________/`;

export default async function EmployeeNdaPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePermission("users.manage");
  const { id } = await params;
  const person = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      lastName: true,
      firstName: true,
      middleName: true,
      birthDate: true,
      role: { select: { code: true, permissions: true } },
    },
  });
  if (!person) notFound();
  const blocked = canEditUser(actor, person);
  const doc = await prisma.personDocument.findUnique({
    where: {
      userId_kind_source_sourceId: {
        userId: person.id,
        kind: "nda",
        source: "hire",
        sourceId: person.id,
      },
    },
    select: { metaJson: true, fileId: true },
  });
  const passport = parseNdaPassport(doc?.metaJson);

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Соглашение о неразглашении"
        subtitle={fullName(person)}
      />
      <Card>
        <h2 className="font-serif text-xl text-navy">Сторона-1</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6">{COMPANY}</p>
        <p className="mt-3 text-sm text-muted">Эти реквизиты уже стоят в документе. Здесь заполняется только вторая сторона.</p>
      </Card>
      <Card>
        <h2 className="font-serif text-xl text-navy">Сторона-2</h2>
        <p className="mt-2 text-sm text-muted">{fullName(person)}</p>
        {blocked ? (
          <p className="mt-4 text-bad">{blocked}</p>
        ) : (
          <div className="mt-4">
            <NdaForm
              userId={person.id}
              birthDate={person.birthDate ? person.birthDate.toISOString().slice(0, 10) : ""}
              sign={shortName(person)}
              passport={passport}
              fileId={doc?.fileId || ""}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

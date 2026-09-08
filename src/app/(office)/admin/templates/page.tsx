import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, PageHeader, Pill } from "@/components/ui";

export default async function TemplatesPage() {
  await requirePermission("admin.settings");
  const templates = await prisma.documentTemplate.findMany({ orderBy: { name: "asc" } });
  return (
    <div>
      <PageHeader
        title="Финансовые шаблоны"
        subtitle="Рабочий сейчас — авансовый отчёт. Остальные бланки уже заведены, их можно включить позже."
      />
      <div className="grid gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <Card key={t.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="font-serif text-xl text-navy">{t.name}</div>
                <p className="text-sm text-muted">{t.description}</p>
                <p className="mt-1 font-mono text-xs">{t.code}</p>
              </div>
              <Pill tone={t.enabled ? "ok" : "draft"}>{t.enabled ? "работает" : "заготовка"}</Pill>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

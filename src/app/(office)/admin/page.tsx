import Link from "next/link";
import { requireUser, can } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";

const LINKS = [
  { href: "/admin/organization", label: "Организация", text: "Реквизиты ООО «Видеаль Медиа»", perm: "org.edit" as const },
  { href: "/admin/roles", label: "Роли и доступ", text: "Что может каждая должность", perm: "roles.manage" as const },
  { href: "/admin/catalogs", label: "Отделы и должности", text: "Справочники", perm: "catalogs.manage" as const },
  { href: "/admin/templates", label: "Финансовые шаблоны", text: "АО-1 и заготовки других бланков", perm: "admin.settings" as const },
  { href: "/admin/settings", label: "Настройки", text: "Файлы, сессии, проверка чеков, почта", perm: "admin.settings" as const },
  { href: "/admin/backup", label: "Резервные копии", text: "Снимок базы на сервер", perm: "admin.backup" as const },
  { href: "/admin/audit", label: "Журнал", text: "Кто что менял", perm: "admin.audit" as const },
  { href: "/inventory", label: "Инвентарь", text: "Как в меню: техника и мебель по людям", perm: "inventory.manage" as const },
  { href: "/control", label: "Контроль", text: "Как в меню: приход, уход, опоздания", perm: "presence.review" as const },
  { href: "/employees", label: "Сотрудники", text: "Как в меню: карточки людей", perm: "users.manage" as const },
  { href: "/admin/documents", label: "Все документы", text: "Любые рассылки", perm: "docs.manage" as const },
];

export default async function AdminPage() {
  const user = await requireUser();
  const items = LINKS.filter((l) => can(user, l.perm));
  return (
    <div>
      <PageHeader title="Админка" subtitle="Здесь можно поправить любые данные офиса" />
      <div className="grid gap-3 md:grid-cols-2">
        {items.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="hover:border-gold">
              <div className="font-serif text-xl text-navy">{l.label}</div>
              <p className="text-muted">{l.text}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

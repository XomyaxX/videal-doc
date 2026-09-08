import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPublicUrl } from "@/lib/public-url";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";
import { PublicUrlBlock } from "./PublicUrlBlock";
import { TestDelivery } from "./TestDelivery";
import { OfficeNetCard } from "./OfficeNetCard";
import { ChatKeyCard } from "./ChatKeyCard";
import { fullName } from "@/lib/names";

export default async function SettingsPage() {
  await requirePermission("admin.settings");
  const [s, publicUrl, people] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "default" } }),
    readPublicUrl(),
    prisma.user.findMany({
      where: { deletedAt: null, status: "active" },
      select: { id: true, login: true, lastName: true, firstName: true, middleName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  return (
    <div>
      <PageHeader title="Настройки системы" />
      <PublicUrlBlock initialUrl={publicUrl} />
      <OfficeNetCard />
      <ChatKeyCard />
      <TestDelivery
        people={people.map((p) => ({
          id: p.id,
          label: fullName(p),
          hint: p.login,
        }))}
      />
      <SettingsForm
        settings={{
          maxUploadMb: s?.maxUploadMb ?? 32,
          sessionDays: s?.sessionDays ?? 30,
          fnsEnabled: s?.fnsEnabled ?? false,
          fnsLogin: s?.fnsLogin || "",
          hasFnsPassword: Boolean(s?.fnsPassword),
          smtpHost: s?.smtpHost || "",
          smtpPort: s?.smtpPort || 587,
          smtpUser: s?.smtpUser || "",
          hasSmtpPassword: Boolean(s?.smtpPassword),
          smtpFrom: s?.smtpFrom || "",
          mailAutoSend: s?.mailAutoSend ?? true,
          accountantEmail: s?.accountantEmail || "vidial_kiv@mail.ru",
          imapHost: s?.imapHost || "",
          imapPort: s?.imapPort || 993,
          imapUser: s?.imapUser || "",
          hasImapPassword: Boolean(s?.imapPassword),
          imapFolder: s?.imapFolder || "INBOX",
        }}
      />
    </div>
  );
}

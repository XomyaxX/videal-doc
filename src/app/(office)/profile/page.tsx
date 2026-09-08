import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { MailboxForm } from "./MailboxForm";
import { ProfileMenu } from "./ProfileMenu";
import { DevicesCard } from "./DevicesCard";
import { InstallApp } from "./InstallApp";
import { PhotoCard } from "./PhotoCard";
import { SoundAlerts } from "./SoundAlerts";

export default async function ProfilePage() {
  const user = await requireUser();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, smtpPassword: true, photoFileId: true, soundAlerts: true },
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Профиль" subtitle="Фото, почта, устройства и выход. Это видят коллеги в чате и в справочнике." />
      <PhotoCard photoFileId={row?.photoFileId || user.photoFileId} lastName={user.lastName} firstName={user.firstName} />
      <InstallApp />
      <SoundAlerts enabled={row?.soundAlerts !== false} />
      <MailboxForm email={row?.email || ""} hasPassword={Boolean(row?.smtpPassword)} />
      <DevicesCard />
      <ProfileMenu />
    </div>
  );
}

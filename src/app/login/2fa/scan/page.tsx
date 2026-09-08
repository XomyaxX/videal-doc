import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { needs2fa } from "@/lib/privileges";
import { ScanConfirm } from "./ScanConfirm";

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const { c } = await searchParams;
  const challengeId = String(c || "");
  const session = await getSession();
  const here = `/login/2fa/scan${challengeId ? `?c=${encodeURIComponent(challengeId)}` : ""}`;
  if (!session) redirect(`/login?next=${encodeURIComponent(here)}`);
  if (session.user.mustChangePassword) redirect("/change-password");
  if (needs2fa(session.user) && !session.user.totpEnabled) {
    redirect(`/setup-2fa?next=${encodeURIComponent(here)}`);
  }
  const needCode = needs2fa(session.user) && session.user.totpEnabled && !session.user.totpOk;
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <ScanConfirm challengeId={challengeId} needCode={needCode} />
    </div>
  );
}

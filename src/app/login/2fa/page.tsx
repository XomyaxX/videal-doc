import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { needs2fa } from "@/lib/privileges";
import { safeNext } from "@/lib/origin";
import { VerifyForm } from "./VerifyForm";

export default async function Login2faPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (!needs2fa(session.user)) redirect("/");
  if (!session.user.totpEnabled) redirect("/setup-2fa");
  if (session.user.totpOk) redirect("/");
  const next = safeNext((await searchParams).next);
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <VerifyForm preferDigits={next.includes("/login/2fa/scan")} />
    </div>
  );
}

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { needs2fa } from "@/lib/privileges";
import { SetupForm } from "./SetupForm";

export default async function Setup2faPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");
  if (!needs2fa(session.user)) redirect("/");
  if (session.user.totpEnabled && session.user.totpOk) redirect("/");
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <SetupForm />
    </div>
  );
}

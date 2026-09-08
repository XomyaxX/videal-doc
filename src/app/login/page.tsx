import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { orgNameShort } from "@/lib/org";
import { safeNext } from "@/lib/origin";
import { LoginForm, PinSetup } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; next?: string }>;
}) {
  const { add, next: nextRaw } = await searchParams;
  const next = safeNext(nextRaw);
  if (!add) {
    const session = await getSession();
    if (session) redirect(next || "/");
  }
  const org = await prisma.organization.findFirst({ select: { shortName: true, name: true } });
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-12">
      <LoginForm add={Boolean(add)} orgShort={orgNameShort(org)} next={next} />
      <div className="mt-6 w-full max-w-md text-center text-sm text-muted">
        Общий компьютер? Закройте список учёток PIN-кодом.
        <PinSetup />
      </div>
    </div>
  );
}

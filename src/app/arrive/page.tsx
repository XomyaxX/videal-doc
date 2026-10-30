import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { officeYmd } from "@/lib/dates";
import { gateTokenValid } from "@/lib/gate";
import { twoFactorPending } from "@/lib/privileges";
import { attendanceClosedError, attendanceStartsLater } from "@/lib/presence";
import { ArriveForm } from "./ArriveForm";

export const dynamic = "force-dynamic";

export default async function ArrivePage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const back = `/arrive?t=${encodeURIComponent(t)}`;
  const next = encodeURIComponent(back);
  const session = await getSession();
  if (!session) redirect(`/login?next=${next}`);
  if (session.user.mustChangePassword) redirect(`/change-password?next=${next}`);
  if (twoFactorPending(session.user)) {
    if (!session.user.totpEnabled) redirect(`/setup-2fa?next=${next}`);
    redirect(`/login/2fa?next=${next}`);
  }
  const [valid, day] = await Promise.all([
    gateTokenValid(t),
    prisma.attendanceDay.findUnique({
      where: { userId_ymd: { userId: session.user.id, ymd: officeYmd() } },
    }),
  ]);
  return (
    <ArriveForm
      token={t}
      valid={valid}
      name={session.user.fullName}
      inAt={day?.inAt?.toISOString() || null}
      outAt={day?.outAt?.toISOString() || null}
      forgot={day?.outSource === "forgot"}
      closed={attendanceStartsLater() ? attendanceClosedError() : ""}
    />
  );
}

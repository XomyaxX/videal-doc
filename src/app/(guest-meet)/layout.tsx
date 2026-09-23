export const dynamic = "force-dynamic";

export default function GuestMeetLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-paper text-navy">
      <div className="mx-auto max-w-lg px-4 py-10">{children}</div>
    </div>
  );
}

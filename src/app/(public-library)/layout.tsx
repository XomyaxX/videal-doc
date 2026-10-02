export const dynamic = "force-dynamic";

export default function PublicLibraryLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper text-navy">{children}</div>;
}

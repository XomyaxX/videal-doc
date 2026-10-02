import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function GatePage({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  const key = (k || "").trim();
  redirect(key ? `/qr?k=${encodeURIComponent(key)}` : "/qr");
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui";

export function ControlSearch({
  query,
  tab,
  from,
  to,
  placeholder,
}: {
  query: string;
  tab: string;
  from: string;
  to: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState(query);

  useEffect(() => {
    setQ(query);
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim() === query.trim()) return;
      const p = new URLSearchParams();
      if (tab !== "people") p.set("tab", tab);
      p.set("from", from);
      p.set("to", to);
      if (q.trim()) p.set("q", q.trim());
      const qs = p.toString();
      router.replace(qs ? `/control?${qs}` : "/control");
    }, 280);
    return () => clearTimeout(t);
  }, [q, query, tab, from, to, router]);

  return (
    <div className="mb-5 max-w-lg">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

export function PublicUrlBlock({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(initialUrl);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/public-url");
        if (!res.ok) return;
        const data = await res.json();
        if (!stop && (data.url === null || typeof data.url === "string")) {
          setUrl(data.url);
        }
      } catch {
        // keep last known value
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return (
    <Card className="mb-6 max-w-lg">
      <h2 className="font-serif text-xl text-navy">Ссылка из интернета</h2>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block break-all font-serif text-2xl text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
        >
          {url}
        </a>
      ) : (
        <p className="mt-3 text-[15px] text-muted">Туннель ещё не выдал адрес, подождите минуту.</p>
      )}
      <p className="mt-3 text-[15px] text-muted">
        С телефона и из дома открывать это. После перезагрузки сервера ссылка может смениться — зайдите сюда с офисного ПК.
      </p>
    </Card>
  );
}

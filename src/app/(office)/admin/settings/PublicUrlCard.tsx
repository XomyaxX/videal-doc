"use client";

import { useEffect, useState } from "react";

export function PublicUrlCard() {
  const [url, setUrl] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/public-url");
        const data = await res.json();
        if (alive) setUrl(typeof data.url === "string" ? data.url : null);
      } catch {
        if (alive) setUrl(null);
      }
    };
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="mb-8 max-w-lg rounded-2xl border border-line bg-white p-5">
      <h2 className="mb-2 font-serif text-xl text-navy">Ссылка из интернета</h2>
      {url === undefined ? (
        <p className="text-muted">Загрузка…</p>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" className="break-all text-lg font-semibold text-navy underline">
          {url}
        </a>
      ) : (
        <p className="text-muted">Туннель ещё не выдал адрес, подождите минуту.</p>
      )}
      <p className="mt-3 text-sm text-muted">
        С телефона и из дома открывать это. После перезагрузки сервера ссылка может смениться — зайдите сюда с офисного ПК.
      </p>
    </div>
  );
}

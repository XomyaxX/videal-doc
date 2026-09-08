"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "./ui";

export type SearchOption = { id: string; label: string; hint?: string };

export function SearchSelect({
  name,
  options,
  defaultId,
  placeholder = "Начните вводить фамилию",
  empty = "Никого не найдено",
  required,
}: {
  name: string;
  options: SearchOption[];
  defaultId?: string;
  placeholder?: string;
  empty?: string;
  required?: boolean;
}) {
  const initial = options.find((o) => o.id === defaultId) ?? null;
  const [query, setQuery] = useState(initial?.label || "");
  const [picked, setPicked] = useState<SearchOption | null>(initial);
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function hide(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru");
    if (!q || (picked && query === picked.label)) return options;
    return options.filter((o) => `${o.label} ${o.hint || ""}`.toLocaleLowerCase("ru").includes(q));
  }, [options, query, picked]);

  function choose(o: SearchOption) {
    setPicked(o);
    setQuery(o.label);
    setOpen(false);
  }

  return (
    <div ref={wrap} className="relative">
      <input type="hidden" name={name} value={picked?.label || ""} required={required} />
      <input
        type="text"
        autoComplete="off"
        value={query}
        placeholder={placeholder}
        className={cn(
          "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-gold",
        )}
        onFocus={(e) => {
          setOpen(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setPicked(null);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[0]) choose(filtered[0]);
          }
        }}
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-line bg-white shadow-[var(--shadow)]">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">{empty}</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                className={cn(
                  "block w-full px-3 py-2 text-left hover:bg-paper",
                  picked?.id === o.id ? "bg-paper font-semibold" : "",
                )}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                {o.hint ? <span className="mt-0.5 block text-xs text-muted">{o.hint}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

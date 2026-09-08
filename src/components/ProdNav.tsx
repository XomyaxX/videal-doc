"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProdNav({
  showScores,
  canCreate,
  showLibrary,
}: {
  showScores: boolean;
  canCreate: boolean;
  showLibrary?: boolean;
}) {
  const path = usePathname();
  const items = [
    { href: "/prod", label: "Мои задачи", match: (p: string) => p === "/prod" },
    { href: "/prod/jobs", label: "Крупные", match: (p: string) => p.startsWith("/prod/jobs") },
    { href: "/prod/pipeline", label: "Пайплайн", match: (p: string) => p.startsWith("/prod/pipeline") },
    { href: "/prod/board", label: "Доска", match: (p: string) => p.startsWith("/prod/board") },
    ...(showLibrary
      ? [{ href: "/library", label: "Хранилище", match: (p: string) => p.startsWith("/library") }]
      : []),
    ...(canCreate
      ? [
          { href: "/prod/new", label: "Новая задача", match: (p: string) => p.startsWith("/prod/new") },
          { href: "/prod/trash", label: "Удалённые", match: (p: string) => p.startsWith("/prod/trash") },
        ]
      : []),
    ...(showScores
      ? [{ href: "/prod/scores", label: "Счётчик", match: (p: string) => p.startsWith("/prod/scores") }]
      : []),
  ];
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {items.map((i) => {
        const on = i.match(path);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              on ? "bg-navy !text-white" : "border border-line bg-white text-navy hover:border-gold"
            }`}
          >
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}

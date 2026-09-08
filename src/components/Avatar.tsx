"use client";

import { useState } from "react";
import { initials } from "@/lib/names";
import { cn } from "./ui";

export function Avatar({
  photoFileId,
  lastName,
  firstName,
  size = 40,
  className,
  gold = false,
}: {
  photoFileId?: string | null;
  lastName: string;
  firstName: string;
  size?: number;
  className?: string;
  gold?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = photoFileId && !failed ? `/api/files/${photoFileId}` : "";
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        gold ? "bg-gold text-white" : "bg-navy text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
    >
      {initials({ lastName, firstName })}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : null}
    </span>
  );
}

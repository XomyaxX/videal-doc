"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export function FlagOk({ id }: { id: string }) {
  const [done, setDone] = useState(false);
  if (done) return <span className="text-sm text-ok">скрыто</span>;
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        const res = await fetch("/api/presence/control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        if (res.ok) setDone(true);
      }}
    >
      Ок
    </Button>
  );
}

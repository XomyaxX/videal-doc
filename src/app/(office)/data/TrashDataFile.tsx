"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui";
import { dataPageHref } from "@/lib/share-data-href";

function parentOf(rel: string) {
  const i = rel.replace(/\\/g, "/").lastIndexOf("/");
  return i >= 0 ? rel.slice(0, i) : "";
}

export function TrashDataFile({ rel }: { rel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError("");
          void fetch("/api/data/trash", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ p: rel }),
          })
            .then(async (res) => {
              const data = (await res.json().catch(() => ({}))) as { error?: string };
              if (!res.ok) throw new Error(data.error || "Не удалось переместить в корзину");
              router.push(dataPageHref(parentOf(rel)));
            })
            .catch((e: unknown) => {
              setBusy(false);
              setError(e instanceof Error ? e.message : "Не удалось");
            });
        }}
      >
        <Trash2 className="h-4 w-4" />
        {busy ? "В корзину…" : "В корзину"}
      </Button>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </>
  );
}

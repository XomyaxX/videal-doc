"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import { DataUploadModal } from "./DataUploadModal";

function parentOf(rel: string) {
  const i = rel.replace(/\\/g, "/").lastIndexOf("/");
  return i >= 0 ? rel.slice(0, i) : "";
}

export function ReplaceDataFile({ rel }: { rel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const name = rel.split("/").pop() || "file";
  const dir = parentOf(rel);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Заменить
      </Button>
      {open ? (
        <DataUploadModal
          dir={dir}
          folderLabel={dir || "Data"}
          replaceName={name}
          onClose={() => setOpen(false)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </>
  );
}

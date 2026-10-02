import { stat } from "fs/promises";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { Button, Card, PageHeader } from "@/components/ui";
import { LibraryViewer, type LibraryCard } from "@/components/LibraryPreview";
import { isBlendName, peekBlendLinks, readBlendNotes } from "@/lib/blend-links";
import { guessLibraryKind, LIBRARY_KIND_LABEL, previewMode } from "@/lib/library-kinds";
import { canWorkData, mimeOf, normalizeRel, parentRel, resolveData } from "@/lib/share-data";
import { dataFileUrl, dataPageHref } from "@/lib/share-data-href";
import { BlendLinksPanel } from "../BlendLinksPanel";
import { ReplaceDataFile } from "../ReplaceDataFile";
import { TrashDataFile } from "../TrashDataFile";

export default async function DataViewPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const user = await requirePermission("data.view");
  const sp = await searchParams;
  let rel = "";
  try {
    rel = normalizeRel(sp.p || "");
  } catch {
    notFound();
  }
  if (!rel) notFound();
  let abs = "";
  try {
    abs = (await resolveData(rel, { exist: true })).abs;
  } catch {
    notFound();
  }
  const st = await stat(/* turbopackIgnore: true */ abs);
  if (st.isDirectory()) redirect(dataPageHref(rel));

  const name = rel.split("/").pop() || rel;
  const mime = mimeOf(name);
  const preview = previewMode({ mimeType: mime, originalName: name });
  const fileUrl = dataFileUrl(rel);
  const thumbUrl =
    preview === "image" || preview === "video" || preview === "pdf" ? dataFileUrl(rel, { poster: true }) : "";
  const kind = guessLibraryKind(name);
  const blend = isBlendName(name);
  const cached = blend ? await peekBlendLinks(rel) : null;
  const notes = cached ? cached.notes : await readBlendNotes(rel);
  const initial = cached || { rel, scannedAt: "", pending: blend, links: [], notes };
  const item: LibraryCard = {
    id: rel,
    title: name,
    kind,
    kindLabel: LIBRARY_KIND_LABEL[kind],
    description: notes.map((n) => n.text).join("\n\n"),
    originalName: name,
    mimeType: mime,
    uncPath: "",
    preview,
    thumbUrl,
    fileUrl,
    href: fileUrl,
    files: [
      {
        id: rel,
        originalName: name,
        mimeType: mime,
        preview,
        fileUrl,
        thumbUrl,
      },
    ],
  };

  return (
    <div>
      <PageHeader
        title={name}
        subtitle="Файл в папке Data"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button href={dataPageHref(parentRel(rel))} variant="secondary">
              К папке
            </Button>
            <Button href={dataFileUrl(rel, { dl: true })} variant="secondary">
              Скачать
            </Button>
            {canWorkData(user) ? <ReplaceDataFile rel={rel} /> : null}
            {canWorkData(user) ? <TrashDataFile rel={rel} /> : null}
          </div>
        }
      />
      <Card className="min-w-0 overflow-hidden">
        <LibraryViewer item={item} />
      </Card>
      <BlendLinksPanel rel={rel} isBlend={blend} initial={initial} canWork={canWorkData(user)} />
    </div>
  );
}

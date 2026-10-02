import { notFound } from "next/navigation";
import { Card } from "@/components/ui";
import { LibraryViewer, type LibraryCard } from "@/components/LibraryPreview";
import { findLibraryShare, serializeLibrary, shareBrowse } from "@/lib/library";
import { LibraryDesk } from "@/app/(office)/library/LibraryDesk";

function publicCard(token: string, row: Parameters<typeof serializeLibrary>[0]): LibraryCard {
  const item = serializeLibrary(row) as LibraryCard;
  item.href = `/l/${token}${row.id ? `?p=${row.id}` : ""}`;
  item.uncPath = "";
  if (item.files) {
    item.files = item.files.map((f) => {
      const fileUrl = `/api/l/${token}/file/${f.id}`;
      return {
        ...f,
        uncPath: "",
        fileUrl,
        thumbUrl:
          f.preview === "image" || f.preview === "video" || f.preview === "pdf" ? `${fileUrl}?poster=1` : "",
        previewUrl: "",
      };
    });
  }
  if (item.fileUrl && !item.isFolder) {
    const first = item.files?.[0];
    item.fileUrl = first?.fileUrl || item.fileUrl;
    item.thumbUrl = first?.thumbUrl || "";
  }
  return item;
}

export default async function PublicLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { token } = await params;
  const { p } = await searchParams;
  const root = await findLibraryShare(token);
  if (!root) notFound();
  const currentId = (p || "").trim() || root.id;
  const browse = await shareBrowse(root.id, currentId);
  if (!browse) notFound();
  const { current, crumbs, children } = browse;
  const isFolder = current.kind === "folder";
  const items = children.map((row) => publicCard(token, row));

  return (
    <div className="mx-auto max-w-5xl px-4 py-5 pb-10 md:py-10">
      <p className="text-sm text-muted">ООО «Видиал Медиа» · хранилище</p>
      {isFolder ? (
        <LibraryDesk
          items={items}
          folderId={current.id}
          crumbs={crumbs.map((c) => ({ id: c.id, title: c.title }))}
          manage={false}
          q=""
          kind=""
          guest={{
            token,
            download: root.shareDownload !== false,
            edit: Boolean(root.shareEdit),
            create: Boolean(root.shareCreate),
            rootId: root.id,
          }}
        />
      ) : (
        <>
          <h1 className="mt-2 font-serif text-3xl text-navy">{current.title}</h1>
          <Card className="mt-6 min-w-0 overflow-hidden">
            <LibraryViewer item={publicCard(token, current)} allowDownload={root.shareDownload !== false} />
          </Card>
        </>
      )}
    </div>
  );
}

import { prisma } from "./prisma";

export async function ensureDocumentRevisions(doc: {
  id: string;
  originalFileId: string;
  version: number;
  authorId: string;
}) {
  const n = await prisma.documentRevision.count({ where: { documentId: doc.id } });
  if (n > 0) return;
  await prisma.documentRevision.create({
    data: {
      documentId: doc.id,
      version: doc.version || 1,
      fileId: doc.originalFileId,
      note: "Первая версия",
      authorId: doc.authorId,
    },
  });
}

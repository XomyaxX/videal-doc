import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { prisma } from "./prisma";
import { userCan, type SessionUser } from "./types";
import { canViewArchive } from "./archive-access";
import { canLeadProd, canManageProd } from "./prod";

const ALLOWED: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-excel": [".xls"],
};

const MAGIC: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "application/pdf", test: (b) => b.slice(0, 5).toString() === "%PDF-" },
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", test: (b) => b.slice(0, 4).toString() === "RIFF" && b.slice(8, 12).toString() === "WEBP" },
  { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", test: (b) => b[0] === 0x50 && b[1] === 0x4b },
  { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", test: (b) => b[0] === 0x50 && b[1] === 0x4b },
];

export function fileRoot(): string {
  const root = process.env.FILE_ROOT || path.join(process.cwd(), "data", "files");
  return path.resolve(/* turbopackIgnore: true */ root);
}

export function safeFilePart(name: string) {
  return (
    (name || "file")
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
      .replace(/\.\./g, "_")
      .replace(/^\.+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "file"
  );
}

export function assertInside(root: string, abs: string) {
  const r = path.resolve(/* turbopackIgnore: true */ root);
  const a = path.resolve(/* turbopackIgnore: true */ abs);
  const prefix = r.endsWith(path.sep) ? r : r + path.sep;
  if (a !== r && !a.startsWith(prefix)) throw new Error("Некорректный путь");
  return a;
}

export function sniffMime(buffer: Buffer, declared: string, filename: string): string | null {
  const ext = path.extname(filename).toLowerCase();
  const magic = MAGIC.find((m) => m.test(buffer));
  const mime = magic?.mime || declared;
  const allowedExt = ALLOWED[mime];
  if (!allowedExt) return null;
  if (ext && !allowedExt.includes(ext)) {
    if (mime.startsWith("image/") && [".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return mime;
    if (!magic) return null;
  }
  return mime;
}

export async function saveUpload(opts: {
  buffer: Buffer;
  originalName: string;
  declaredMime: string;
  userId: string;
  maxBytes: number;
}) {
  if (opts.buffer.length === 0) throw new Error("Пустой файл");
  if (opts.buffer.length > opts.maxBytes) throw new Error("Файл слишком большой");
  const mime = sniffMime(opts.buffer, opts.declaredMime, opts.originalName);
  if (!mime) throw new Error("Этот тип файла нельзя загрузить");

  const id = randomUUID();
  const ext = path.extname(opts.originalName).toLowerCase() || "";
  const rel = `${id}${ext}`;
  const dir = fileRoot();
  await mkdir(dir, { recursive: true });
  const abs = path.join(/* turbopackIgnore: true */ dir, rel);
  await writeFile(/* turbopackIgnore: true */ abs, opts.buffer);

  const sha256 = createHash("sha256").update(opts.buffer).digest("hex");
  return prisma.storedFile.create({
    data: {
      id,
      originalName: path.basename(opts.originalName).slice(0, 200),
      mimeType: mime,
      size: opts.buffer.length,
      path: rel,
      sha256,
      createdById: opts.userId,
    },
  });
}

export async function readStoredFile(id: string) {
  const rec = await prisma.storedFile.findUnique({ where: { id } });
  if (!rec) return null;
  if (rec.path.includes("..") || path.isAbsolute(rec.path)) return null;
  const abs = assertInside(fileRoot(), path.join(/* turbopackIgnore: true */ fileRoot(), rec.path));
  const buffer = await readFile(/* turbopackIgnore: true */ abs);
  return { rec, buffer };
}

export async function canReadStoredFile(user: SessionUser, fileId: string): Promise<boolean> {
  if (user.roleCode === "superadmin" || user.roleCode === "admin") return true;
  const rec = await prisma.storedFile.findUnique({ where: { id: fileId }, select: { id: true, createdById: true } });
  if (!rec) return false;
  if (rec.createdById === user.id) return true;

  const [doc, signed, receipt, hr, fund, purchase, libItem, libFile, personDoc, photo, signature, org, jobFile, groupAvatar, revision] = await Promise.all([
    prisma.document.findFirst({
      where: { OR: [{ originalFileId: fileId }, { printFileId: fileId }] },
      select: { id: true, authorId: true },
    }),
    prisma.documentRecipient.findFirst({
      where: { signedFileId: fileId },
      select: { userId: true, document: { select: { authorId: true } } },
    }),
    prisma.receipt.findFirst({
      where: { OR: [{ sourceFileId: fileId }, { files: { some: { fileId } } }] },
      select: { report: { select: { userId: true } } },
    }),
    prisma.hrRequest.findFirst({
      where: { signedFileId: fileId },
      select: { authorId: true, managerId: true },
    }),
    prisma.fundRequestFile.findFirst({
      where: { fileId },
      select: { request: { select: { authorId: true, managerId: true } } },
    }),
    prisma.purchaseItem.findFirst({
      where: { fileId },
      select: { request: { select: { authorId: true } } },
    }),
    prisma.libraryItem.findFirst({
      where: { deletedAt: null, OR: [{ fileId }, { previewFileId: fileId }] },
      select: { id: true },
    }),
    prisma.libraryFile.findFirst({
      where: { fileId, item: { deletedAt: null } },
      select: { id: true },
    }),
    prisma.personDocument.findFirst({
      where: { fileId },
      select: { userId: true, user: { select: { id: true, departmentId: true, managerId: true } } },
    }),
    prisma.user.findFirst({
      where: { photoFileId: fileId },
      select: { id: true },
    }),
    prisma.user.findFirst({
      where: { signatureFileId: fileId },
      select: { id: true },
    }),
    prisma.organization.findFirst({
      where: { OR: [{ logoFileId: fileId }, { facsimileFileId: fileId }] },
      select: { id: true },
    }),
    prisma.jobMessageFile.findFirst({
      where: { fileId, message: { deletedAt: null } },
      select: { message: { select: { jobId: true } } },
    }),
    prisma.chat.findFirst({
      where: { avatarFileId: fileId },
      select: { id: true },
    }),
    prisma.documentRevision.findFirst({
      where: { fileId },
      select: { document: { select: { id: true, authorId: true } } },
    }),
  ]);

  if (org) return true;
  if (photo) return true;
  if (groupAvatar) return true;
  if (signature) return signature.id === user.id || userCan(user, "users.view");
  if (libItem || libFile) {
    return userCan(user, "prod.work") || userCan(user, "prod.lead") || userCan(user, "prod.manage");
  }
  if (personDoc) return canViewArchive(user, personDoc.user);

  const letter = doc || revision?.document;
  if (letter) {
    if (userCan(user, "docs.view_all") || letter.authorId === user.id) return true;
    const mine = await prisma.documentRecipient.findFirst({
      where: { documentId: letter.id, userId: user.id },
      select: { id: true },
    });
    if (mine) return true;
  }
  if (signed) {
    if (signed.userId === user.id || signed.document.authorId === user.id || userCan(user, "docs.view_all")) return true;
  }
  if (receipt) {
    if (receipt.report.userId === user.id || userCan(user, "finance.view_all")) return true;
  }
  if (hr) {
    if (hr.authorId === user.id || hr.managerId === user.id) return true;
  }
  if (fund) {
    if (
      fund.request.authorId === user.id ||
      fund.request.managerId === user.id ||
      userCan(user, "finance.view_all") ||
      userCan(user, "finance.approve")
    ) {
      return true;
    }
  }
  if (purchase) {
    if (purchase.request.authorId === user.id || userCan(user, "requests.aho")) return true;
  }
  if (jobFile) {
    if (canLeadProd(user) || canManageProd(user)) return true;
    const jobId = jobFile.message.jobId;
    const [member, assigned] = await Promise.all([
      prisma.jobMember.findUnique({ where: { jobId_userId: { jobId, userId: user.id } } }),
      prisma.task.findFirst({ where: { jobId, assigneeId: user.id, deletedAt: null }, select: { id: true } }),
    ]);
    if (member || assigned) return true;
  }
  return false;
}

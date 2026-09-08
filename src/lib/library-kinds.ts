export const LIBRARY_KINDS = [
  { id: "document", label: "Документы", hint: "PDF, Word, таблицы" },
  { id: "logo", label: "Логотипы", hint: "PNG, SVG, PDF" },
  { id: "concept", label: "Концепты", hint: "эскизы, референсы, PDF" },
  { id: "image", label: "Изображения", hint: "фото, рендер, PNG/JPG" },
  { id: "script", label: "Сценарии", hint: "PDF, Word, текст" },
  { id: "model3d", label: "3D модели", hint: "blend, fbx, obj, glb" },
] as const;

export type LibraryKind = (typeof LIBRARY_KINDS)[number]["id"];

export const LIBRARY_KIND_LABEL: Record<string, string> = Object.fromEntries(
  LIBRARY_KINDS.map((k) => [k.id, k.label]),
);

export function libraryKindOk(kind: string): kind is LibraryKind {
  return LIBRARY_KINDS.some((k) => k.id === kind);
}

export const LIBRARY_KIND_EXT: Record<string, string[]> = {
  document: [".pdf", ".doc", ".docx", ".xlsx", ".xls", ".txt", ".rtf", ".odt"],
  logo: [".png", ".svg", ".pdf", ".jpg", ".jpeg", ".webp", ".ai", ".eps"],
  concept: [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".psd", ".tif", ".tiff", ".gif"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".svg"],
  script: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".fountain", ".fdx"],
  model3d: [".blend", ".fbx", ".obj", ".abc", ".glb", ".gltf", ".ma", ".mb", ".ztl", ".stl", ".usd", ".usda", ".usdc"],
};

export const LIBRARY_ACCEPT = Object.values(LIBRARY_KIND_EXT)
  .flat()
  .filter((v, i, a) => a.indexOf(v) === i)
  .join(",");

export function guessLibraryKind(filename: string, preferred?: string): LibraryKind {
  const ext = extOf(filename);
  if (preferred && libraryKindOk(preferred) && LIBRARY_KIND_EXT[preferred]?.includes(ext)) {
    return preferred;
  }
  if (LIBRARY_KIND_EXT.model3d.includes(ext)) return "model3d";
  if ([".svg", ".ai", ".eps"].includes(ext)) return "logo";
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"].includes(ext)) return "image";
  if ([".doc", ".docx", ".xls", ".xlsx", ".odt", ".rtf"].includes(ext)) return "document";
  if ([".txt", ".fountain", ".fdx"].includes(ext)) return "script";
  if (ext === ".pdf") return "document";
  if (preferred && libraryKindOk(preferred)) return preferred;
  return "document";
}

export function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || name;
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function previewMode(opts: { mimeType: string; originalName: string; previewFileId?: string }) {
  if (opts.previewFileId) return "image" as const;
  const ext = extOf(opts.originalName);
  const mime = opts.mimeType || "";
  if (mime.startsWith("image/") && mime !== "image/tiff") return "image" as const;
  if (ext === ".svg" || mime === "image/svg+xml") return "image" as const;
  if (mime === "application/pdf" || ext === ".pdf") return "pdf" as const;
  if (mime.startsWith("video/") || ext === ".mp4" || ext === ".webm") return "video" as const;
  return "none" as const;
}

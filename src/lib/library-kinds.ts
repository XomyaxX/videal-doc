export const LIBRARY_KINDS = [
  { id: "document", label: "Документы", hint: "PDF, Word, таблицы — или любой другой файл" },
  { id: "logo", label: "Логотипы", hint: "PNG, SVG, PDF — или любой другой файл" },
  { id: "concept", label: "Концепты", hint: "эскизы, референсы, видео — или любой файл" },
  { id: "image", label: "Изображения", hint: "фото, рендер — или любой другой файл" },
  { id: "script", label: "Сценарии", hint: "PDF, Word, текст — или любой другой файл" },
  { id: "model3d", label: "3D модели", hint: "blend, fbx, obj, glb — или любой файл" },
  { id: "audio", label: "Аудио", hint: "mp3, wav, ogg, flac — или любой файл" },
  { id: "file", label: "Прочее", hint: "архивы и любые файлы" },
] as const;

export type LibraryKind = (typeof LIBRARY_KINDS)[number]["id"];

export const LIBRARY_KIND_LABEL: Record<string, string> = {
  folder: "Папка",
  ...Object.fromEntries(LIBRARY_KINDS.map((k) => [k.id, k.label])),
};

export function libraryKindOk(kind: string): kind is LibraryKind {
  return LIBRARY_KINDS.some((k) => k.id === kind);
}

export const LIBRARY_KIND_EXT: Record<string, string[]> = {
  document: [".pdf", ".doc", ".docx", ".xlsx", ".xls", ".txt", ".rtf", ".odt", ".ppt", ".pptx", ".csv", ".ods"],
  logo: [".png", ".svg", ".pdf", ".jpg", ".jpeg", ".webp", ".ai", ".eps"],
  concept: [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".psd", ".tif", ".tiff", ".gif", ".mp4", ".webm", ".mov"],
  image: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff", ".bmp", ".svg"],
  script: [".pdf", ".doc", ".docx", ".txt", ".rtf", ".fountain", ".fdx"],
  model3d: [".blend", ".fbx", ".obj", ".abc", ".glb", ".gltf", ".ma", ".mb", ".ztl", ".stl", ".usd", ".usda", ".usdc"],
  audio: [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"],
  file: [],
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
  if ([".doc", ".docx", ".xls", ".xlsx", ".odt", ".rtf", ".ppt", ".pptx", ".csv", ".ods"].includes(ext)) {
    return "document";
  }
  if ([".txt", ".fountain", ".fdx"].includes(ext)) return "script";
  if ([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi"].includes(ext)) return "concept";
  if ([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"].includes(ext)) return "audio";
  if ([".zip", ".rar", ".7z", ".tar", ".gz"].includes(ext)) return "file";
  if (ext === ".pdf") return "document";
  if (preferred && libraryKindOk(preferred)) return preferred;
  return "file";
}

export function titleFromFilename(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim() || name;
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

const CONVERT_3D = new Set([".blend", ".fbx", ".obj", ".stl", ".abc"]);

export function needsGlbPreview(originalName: string) {
  return CONVERT_3D.has(extOf(originalName));
}

export function isModel3dName(originalName: string, mime = "") {
  const ext = extOf(originalName);
  return (
    needsGlbPreview(originalName) ||
    ext === ".glb" ||
    ext === ".gltf" ||
    mime === "model/gltf-binary" ||
    mime === "model/gltf+json"
  );
}

export type PreviewKind = "image" | "pdf" | "docx" | "video" | "audio" | "model3d" | "none";

export function previewHasThumb(mode: PreviewKind) {
  return mode === "image" || mode === "video" || mode === "pdf";
}

export function previewMode(opts: { mimeType: string; originalName: string; previewFileId?: string }): PreviewKind {
  if (opts.previewFileId) return "image";
  const ext = extOf(opts.originalName);
  const mime = opts.mimeType || "";
  if (ext === ".svg" || mime === "image/svg+xml") return "image";
  if (
    mime.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"].includes(ext)
  ) {
    return "image";
  }
  if (mime === "application/pdf" || ext === ".pdf") return "pdf";
  if (
    ext === ".docx" ||
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    mime.startsWith("video/") ||
    [".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi"].includes(ext)
  ) {
    return "video";
  }
  if (
    mime.startsWith("audio/") ||
    [".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".wma"].includes(ext)
  ) {
    return "audio";
  }
  if (mime === "model/gltf-binary" || mime === "model/gltf+json" || ext === ".glb" || ext === ".gltf") return "model3d";
  return "none";
}

function extFor(mime: string, fallbackName: string) {
  const fromName = fallbackName.includes(".") ? fallbackName.slice(fallbackName.lastIndexOf(".")).toLowerCase() : "";
  if (fromName && fromName !== ".") return fromName;
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "application/pdf") return ".pdf";
  if (mime.startsWith("video/")) return ".mp4";
  if (mime.startsWith("audio/")) return ".webm";
  return "";
}

function named(file: File, index: number) {
  const raw = (file.name || "").trim();
  const dummy = !raw || raw === "image.png" || raw === "image.jpg" || raw === "blob";
  if (!dummy) return file;
  const ext = extFor(file.type, raw) || ".png";
  const base = file.type.startsWith("image/") ? "screenshot" : "paste";
  return new File([file], `${base}-${index + 1}${ext}`, { type: file.type || "application/octet-stream" });
}

export function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  const seen = new Set<string>();
  const push = (file: File | null) => {
    if (!file || file.size <= 0) return;
    const key = `${file.type}:${file.size}:${file.name}:${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(named(file, out.length));
  };
  if (data.items) {
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.kind !== "file") continue;
      push(item.getAsFile());
    }
  }
  if (!out.length && data.files) {
    for (let i = 0; i < data.files.length; i++) push(data.files[i]);
  }
  return out;
}

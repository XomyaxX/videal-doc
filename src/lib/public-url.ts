import { readFile } from "fs/promises";
import path from "path";

function candidates(): string[] {
  const env = process.env.PUBLIC_URL_FILE?.trim();
  const list = [
    env || "/var/lib/videal-edo/public-url.txt",
    path.join(process.cwd(), "data", "public-url.txt"),
  ];
  return [...new Set(list)];
}

export async function readPublicUrl(): Promise<string | null> {
  for (const file of candidates()) {
    try {
      const raw = (await readFile(file, "utf8")).trim();
      const m = raw.match(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/?$/i);
      if (m) return m[0].replace(/\/$/, "");
    } catch {
      // missing file is expected before the tunnel is up
    }
  }
  return null;
}

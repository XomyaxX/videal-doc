import type { PreviewKind } from "./library-kinds";

export type DataEntry = {
  name: string;
  rel: string;
  isDir: boolean;
  size: number;
  mime: string;
  preview: PreviewKind;
};

export type TrashEntry = DataEntry & {
  id: string;
  deletedAt: string;
};

export function dataFileUrl(rel: string, extra?: { dl?: boolean; poster?: boolean }) {
  const p = new URLSearchParams();
  p.set("p", rel);
  if (extra?.dl) p.set("dl", "1");
  if (extra?.poster) p.set("poster", "1");
  return `/api/data/file?${p.toString()}`;
}

export function dataPageHref(rel: string) {
  return rel ? `/data?p=${encodeURIComponent(rel)}` : "/data";
}

export function dataViewHref(rel: string) {
  return `/data/view?p=${encodeURIComponent(rel)}`;
}

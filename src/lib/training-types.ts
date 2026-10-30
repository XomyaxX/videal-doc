import type { PreviewKind } from "./library-kinds";

export type TrainingFileCard = {
  id: string;
  originalName: string;
  mimeType: string;
  size: string;
  sizeLabel: string;
  preview: PreviewKind;
  fileUrl: string;
  thumbUrl: string;
  deletedAt: string | null;
};

export type TrainingCard = {
  id: string;
  title: string;
  description: string;
  kind: string;
  kindLabel: string;
  parentId: string | null;
  isFolder: boolean;
  originalName: string;
  mimeType: string;
  size: string;
  sizeLabel: string;
  preview: PreviewKind;
  fileUrl: string;
  thumbUrl: string;
  href: string;
  files: TrainingFileCard[];
  fileCount: number;
  authorName: string;
  createdAt: string;
  deletedAt: string | null;
};

export type BlendLinkKind = "library" | "image" | "file" | "note" | "dir";

export type BlendLink = {
  rel: string;
  name: string;
  kind: BlendLinkKind;
  exists: boolean;
  size: number;
};

export type BlendNote = {
  rel: string;
  name: string;
  text: string;
};

export type BlendLinksInfo = {
  rel: string;
  scannedAt: string;
  pending?: boolean;
  links: BlendLink[];
  notes: BlendNote[];
  error?: string;
  zipCount?: number;
  zipBytes?: number;
  zipCapped?: boolean;
};

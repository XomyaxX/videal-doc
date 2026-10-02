export const VD_HEAVY_DL = "vd-heavy-download";

export function setHeavyDownload(on: boolean) {
  try {
    (window as Window & { vdHeavyDownload?: boolean }).vdHeavyDownload = on;
    window.dispatchEvent(new CustomEvent(VD_HEAVY_DL, { detail: on }));
  } catch {
    /* ignore */
  }
}

export function isHeavyDownload() {
  try {
    return Boolean((window as Window & { vdHeavyDownload?: boolean }).vdHeavyDownload);
  } catch {
    return false;
  }
}

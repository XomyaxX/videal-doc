declare module "archiver" {
  import type { Writable } from "stream";
  type Archive = {
    pipe(dest: Writable): Writable;
    file(path: string, opts: { name: string }): void;
    finalize(): void | Promise<void>;
    on(event: "error", cb: (err: Error) => void): void;
  };
  function archiver(format: string, opts?: { zlib?: { level?: number } }): Archive;
  export default archiver;
}

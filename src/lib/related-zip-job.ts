import { createReadStream, createWriteStream } from "fs";
import { readdir, rm, stat } from "fs/promises";
import { randomUUID } from "crypto";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { planRelatedZip } from "./blend-links";
import { fillRelatedZip, remapTmpDir } from "./blend-remap";
import { assertInside } from "./files";

export type RelatedJobPublic = {
  id: string;
  status: "run" | "ready" | "fail" | "abort";
  phase: "plan" | "remap" | "zip" | "ready";
  pct: number;
  hint: string;
  bytes?: number;
  name?: string;
  error?: string;
};

type RelatedJob = {
  id: string;
  userId: string;
  rel: string;
  status: "run" | "ready" | "fail" | "abort";
  phase: "plan" | "remap" | "zip" | "ready";
  pct: number;
  hint: string;
  error?: string;
  tmp: string;
  zipAbs?: string;
  zipName?: string;
  zipBytes?: number;
  abortFlag: { aborted: boolean };
  createdAt: number;
};

const g = globalThis as unknown as { vdRelatedJobs?: Map<string, RelatedJob> };

function jobs() {
  if (!g.vdRelatedJobs) g.vdRelatedJobs = new Map();
  return g.vdRelatedJobs;
}

export function publicJob(job: RelatedJob): RelatedJobPublic {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    pct: job.pct,
    hint: job.hint,
    bytes: job.zipBytes,
    name: job.zipName,
    error: job.error,
  };
}

export function getRelatedJob(id: string, userId: string) {
  const job = jobs().get(id);
  if (!job || job.userId !== userId) return null;
  return job;
}

async function cleanTmp(tmp: string) {
  if (!tmp) return;
  await rm(/* turbopackIgnore: true */ tmp, { recursive: true, force: true }).catch(() => {});
}

function pruneJobs() {
  const now = Date.now();
  for (const [id, job] of jobs()) {
    if (now - job.createdAt < 40 * 60 * 1000) continue;
    job.abortFlag.aborted = true;
    void cleanTmp(job.tmp);
    jobs().delete(id);
  }
}

export async function abortRelatedJob(id: string, userId: string) {
  const job = getRelatedJob(id, userId);
  if (!job) return false;
  job.abortFlag.aborted = true;
  job.status = "abort";
  job.hint = "Отменено";
  await cleanTmp(job.tmp);
  job.tmp = "";
  jobs().delete(id);
  return true;
}

export async function startRelatedJob(opts: { userId: string; rel: string }) {
  pruneJobs();
  for (const job of jobs().values()) {
    if (job.userId === opts.userId && job.rel === opts.rel && (job.status === "run" || job.status === "ready")) return job;
  }
  const tmp = await remapTmpDir();
  const job: RelatedJob = {
    id: randomUUID(),
    userId: opts.userId,
    rel: opts.rel,
    status: "run",
    phase: "plan",
    pct: 1,
    hint: "Собираю список файлов",
    tmp,
    abortFlag: { aborted: false },
    createdAt: Date.now(),
  };
  jobs().set(job.id, job);
  void runRelatedJob(job);
  return job;
}

type ZipBuilder = {
  abort: () => void;
  finalize: () => Promise<void> | void;
  pipe: (s: NodeJS.WritableStream) => unknown;
  on: (ev: string, fn: (err: Error) => void) => unknown;
  file: (abs: string, opts: { name: string }) => unknown;
  append: (data: string | Buffer, opts: { name: string }) => unknown;
};

async function runRelatedJob(job: RelatedJob) {
  let archive: ZipBuilder | null = null;
  try {
    const plan = await planRelatedZip(job.rel);
    if (job.abortFlag.aborted) throw new Error("Отменено");
    job.zipName = `${plan.name}.zip`;
    job.phase = "remap";
    job.pct = 5;
    job.hint = "Готовлю файлы";
    const archiver = (await import("archiver")).default;
    const zipAbs = assertInside(job.tmp, path.join(job.tmp, "out.zip"));
    const built = archiver("zip", { zlib: { level: 1 } }) as unknown as ZipBuilder;
    archive = built;
    const output = createWriteStream(/* turbopackIgnore: true */ zipAbs);
    const done = new Promise<void>((resolve, reject) => {
      output.on("close", () => resolve());
      output.on("error", reject);
      built.on("error", reject);
    });
    built.pipe(output);
    await fillRelatedZip(built, job.rel, plan.files, job.tmp, job.abortFlag, (p) => {
      if (job.abortFlag.aborted) return;
      if (p.phase === "remap") {
        job.phase = "remap";
        job.pct = 8 + Math.round((p.index / Math.max(p.total, 1)) * 72);
        job.hint = `.blend ${p.index} из ${p.total}`;
      } else {
        job.pct = 6;
        job.hint = "Пакую файлы";
      }
    });
    if (job.abortFlag.aborted) throw new Error("Отменено");
    job.phase = "zip";
    job.pct = 90;
    job.hint = "Закрываю архив";
    await built.finalize();
    await done;
    if (job.abortFlag.aborted) throw new Error("Отменено");
    const leftover = await readdir(/* turbopackIgnore: true */ job.tmp);
    for (const name of leftover) {
      if (name === "out.zip") continue;
      await rm(/* turbopackIgnore: true */ path.join(job.tmp, name), { recursive: true, force: true }).catch(() => {});
    }
    const st = await stat(/* turbopackIgnore: true */ zipAbs);
    job.zipAbs = zipAbs;
    job.zipBytes = st.size;
    job.status = "ready";
    job.phase = "ready";
    job.pct = 100;
    job.hint = "Архив готов";
  } catch (e) {
    try {
      archive?.abort();
    } catch {
      /* already closed */
    }
    const msg = e instanceof Error ? e.message : "Не удалось собрать архив";
    if (job.status !== "abort") {
      job.status = "fail";
      job.error = msg;
      job.hint = msg;
    }
    try {
      await cleanTmp(job.tmp);
    } catch {
      /* ignore */
    }
    job.tmp = "";
    job.zipAbs = undefined;
  }
}

export async function relatedJobFileResponse(job: RelatedJob) {
  if (job.status !== "ready" || !job.zipAbs) {
    return NextResponse.json({ error: job.error || "Архив ещё не готов", ...publicJob(job) }, { status: 409 });
  }
  const st = await stat(/* turbopackIgnore: true */ job.zipAbs);
  const node = createReadStream(/* turbopackIgnore: true */ job.zipAbs);
  const name = job.zipName || "related.zip";
  return new NextResponse(Readable.toWeb(node) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(st.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-Zip-Estimate": String(st.size),
    },
  });
}

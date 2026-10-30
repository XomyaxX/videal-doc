import { spawn } from "child_process";
import { copyFile, link, mkdir, rm, stat } from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_SOURCES = [
  {
    src: String.raw`C:\Users\LENOVO\Downloads\1. Блокинг.mkv`,
    alts: ["1. Блокинг.mkv", "1-blocking.mkv", "1.mkv"],
    title: "1. Блокинг",
    description: "Обучающее видео: блокинг в анимации.",
  },
  {
    src: String.raw`C:\Users\LENOVO\Downloads\2. Сплайн.mkv`,
    alts: ["2. Сплайн.mkv", "2-spline.mkv", "2.mkv"],
    title: "2. Сплайн",
    description: "Обучающее видео: сплайн.",
  },
  {
    src: String.raw`C:\Users\LENOVO\Downloads\3. Полишинг.mp4`,
    alts: ["3. Полишинг.mp4", "3-polishing.mp4", "3.mp4"],
    title: "3. Полишинг",
    description: "Обучающее видео: полишинг.",
  },
];

function fileRoot() {
  const root = process.env.FILE_ROOT || path.join(process.cwd(), "data", "files");
  return path.resolve(root);
}

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function mimeOf(name: string) {
  const ext = extOf(name);
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".mov") return "video/quicktime";
  return "application/octet-stream";
}

function kindOf(name: string) {
  const ext = extOf(name);
  if ([".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi"].includes(ext)) return "video";
  return "file";
}

function run(cmd: string, args: string[], cwd?: string) {
  return new Promise<boolean>((resolve) => {
    const p = spawn(cmd, args, { stdio: "ignore", cwd });
    p.on("close", (code) => resolve(code === 0));
    p.on("error", () => resolve(false));
  });
}

async function place(src: string, dest: string) {
  await mkdir(path.dirname(dest), { recursive: true });
  try {
    await link(src, dest);
    return "link";
  } catch {
    await copyFile(src, dest);
    return "copy";
  }
}

async function main() {
  const extraDir = process.env.TRAINING_SEED_DIR || process.argv[2] || "";
  async function resolveSrc(row: (typeof DEFAULT_SOURCES)[number]) {
    const candidates = extraDir
      ? row.alts.map((name) => path.join(extraDir, name)).concat(path.join(extraDir, path.basename(row.src)))
      : [row.src];
    for (const cand of candidates) {
      try {
        await stat(cand);
        return cand;
      } catch {
        /* try next */
      }
    }
    return "";
  }

  const author =
    (await prisma.user.findFirst({ where: { login: "admin", deletedAt: null }, select: { id: true, login: true } })) ||
    (await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true, login: true } }));
  if (!author) throw new Error("Нет пользователя для автора материалов");

  for (const row of DEFAULT_SOURCES) {
    const exists = await prisma.trainingItem.findFirst({
      where: { title: row.title, deletedAt: null },
      select: { id: true },
    });
    if (exists) {
      console.log("skip", row.title, exists.id);
      continue;
    }
    const src = await resolveSrc(row);
    if (!src) {
      console.log("missing", row.title);
      continue;
    }

    const item = await prisma.trainingItem.create({
      data: {
        title: row.title,
        description: row.description,
        kind: "video",
        authorId: author.id,
      },
    });
    const file = await prisma.trainingFile.create({
      data: {
        itemId: item.id,
        originalName: path.basename(src),
        mimeType: mimeOf(src),
        size: "0",
        relPath: "pending",
      },
    });

    let destName = `${file.id}${extOf(src)}`;
    let dest = path.join(fileRoot(), "training", item.id, destName);
    const how = await place(src, dest);
    let st = await stat(dest);

    if (extOf(src) === ".mkv") {
      const mp4Name = `${file.id}.mp4`;
      const mp4 = path.join(fileRoot(), "training", item.id, mp4Name);
      const ok = await run("ffmpeg", ["-y", "-i", dest, "-c", "copy", "-movflags", "+faststart", mp4]);
      if (ok) {
        try {
          const mp4st = await stat(mp4);
          if (mp4st.size > 1024) {
            destName = mp4Name;
            dest = mp4;
            st = mp4st;
            await rm(path.join(fileRoot(), "training", item.id, `${file.id}.mkv`), { force: true }).catch(() => null);
            console.log("remux", row.title);
          }
        } catch {
          /* keep mkv */
        }
      }
    }

    await prisma.trainingFile.update({
      where: { id: file.id },
      data: {
        originalName: extOf(destName) === ".mp4" ? path.basename(src).replace(/\.mkv$/i, ".mp4") : path.basename(src),
        mimeType: mimeOf(destName),
        size: String(st.size),
        relPath: path.posix.join("training", item.id, destName),
      },
    });
    await prisma.trainingItem.update({
      where: { id: item.id },
      data: { kind: kindOf(destName) },
    });
    console.log("ok", how, row.title, item.id, st.size);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

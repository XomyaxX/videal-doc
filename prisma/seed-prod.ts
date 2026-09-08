import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { ROLE_PRESETS } from "../src/lib/permissions";
import {
  CHARACTER_STAGES,
  LOCATION_STAGES,
  SCENE_STAGES,
  SHOT_STAGES,
  STAGE_COMPLEXITY,
  fromWinPath,
  loginsFromSheet,
  parseSheetDate,
  parseSheetStatus,
  shareRoot,
} from "../src/lib/prod";
import { isLocationAssetName, reclassifyAssetKind } from "../src/lib/asset-kind";

const prisma = new PrismaClient();
const TEMP = "Videal2026!";

async function upsertDept(name: string) {
  const found = await prisma.department.findFirst({ where: { name, deletedAt: null } });
  if (found) return found;
  return prisma.department.create({ data: { name } });
}

async function upsertPos(name: string) {
  const found = await prisma.position.findFirst({ where: { name, deletedAt: null } });
  if (found) return found;
  return prisma.position.create({ data: { name } });
}

async function main() {
  const sheetsOnly = process.argv.includes("--sheets-only");
  if (sheetsOnly) {
    await importSheets();
    return;
  }

  for (const [code, perms] of Object.entries(ROLE_PRESETS)) {
    await prisma.role.updateMany({
      where: { code },
      data: { permissions: JSON.stringify(perms) },
    });
  }

  const depts = {
    admin: await upsertDept("Администрация"),
    anim: await upsertDept("Анимация"),
    prod: await upsertDept("Производство"),
    ii: await upsertDept("ИИ"),
    aho: await upsertDept("Административно-хозяйственный отдел"),
    hr: await upsertDept("Кадры"),
    script: await upsertDept("Сценарий"),
  };

  const pos = {
    "3D-художник": await upsertPos("3D-художник"),
    "Ведущий 3D-художник": await upsertPos("Ведущий 3D-художник"),
    "Художник-аниматор": await upsertPos("Художник-аниматор"),
    "Художник по раскадровке": await upsertPos("Художник по раскадровке"),
    "Линейный режиссер, аниматор": await upsertPos("Линейный режиссер, аниматор"),
    "Руководитель отдела анимации": await upsertPos("Руководитель отдела анимации"),
    "Исполнительный директор": await upsertPos("Исполнительный директор"),
    "Генеральный директор": await upsertPos("Генеральный директор"),
    "Художественный руководитель": await upsertPos("Художественный руководитель"),
    "Специалист по кадрам": await upsertPos("Специалист по кадрам"),
    "Программист": await upsertPos("Программист"),
    "Старший программист": await upsertPos("Старший программист"),
    "Ассистент сценариста": await upsertPos("Ассистент сценариста"),
    "3D-моделлер": await upsertPos("3D-моделлер"),
    "VFX-художник": await upsertPos("VFX-художник"),
  };

  const roles = Object.fromEntries(
    (await prisma.role.findMany()).map((r) => [r.code, r]),
  );

  const staff: Array<{
    login: string;
    lastName: string;
    firstName: string;
    middleName: string;
    role: string;
    dept: keyof typeof depts | null;
    position: keyof typeof pos;
    prodScope?: string;
    create?: boolean;
  }> = [
    { login: "boyarenok", lastName: "Бояренок", firstName: "Евгения", middleName: "Анатольевна", role: "employee", dept: "prod", position: "3D-художник" },
    { login: "girsov.va", lastName: "Гирсов", firstName: "Валерий", middleName: "Александрович", role: "employee", dept: "anim", position: "Художник-аниматор" },
    { login: "demidovich", lastName: "Демидович", firstName: "Ксения", middleName: "Александровна", role: "employee", dept: "prod", position: "Ведущий 3D-художник" },
    { login: "lyudmila", lastName: "Залуцкая", firstName: "Людмила", middleName: "Игоревна", role: "admin", dept: "admin", position: "Исполнительный директор", prodScope: "studio" },
    { login: "kozlov", lastName: "Козлов", firstName: "Венедикт", middleName: "Вадимович", role: "employee", dept: "ii", position: "Старший программист" },
    { login: "laptev", lastName: "Лаптев", firstName: "Александр", middleName: "Владимирович", role: "manager", dept: "anim", position: "Руководитель отдела анимации", prodScope: "dept" },
    { login: "rebro", lastName: "Ребро", firstName: "Ева", middleName: "Дмитриевна", role: "employee", dept: "anim", position: "Художник-аниматор" },
    { login: "tochanskaya", lastName: "Точанская", firstName: "Екатерина", middleName: "Евгеньевна", role: "employee", dept: "anim", position: "Художник по раскадровке" },
    { login: "rulko", lastName: "Рулько", firstName: "Виктория", middleName: "Сергеевна", role: "employee", dept: "prod", position: "3D-художник" },
    { login: "khozyainov", lastName: "Хозяинов", firstName: "Максим", middleName: "Андреевич", role: "employee", dept: "anim", position: "Художник-аниматор" },
    { login: "novikova", lastName: "Новикова", firstName: "Дарья", middleName: "Дмитриевна", role: "employee", dept: "prod", position: "3D-художник" },
    { login: "propastina", lastName: "Пропастина", firstName: "Полина", middleName: "Сергеевна", role: "employee", dept: "anim", position: "Линейный режиссер, аниматор" },
    { login: "ermilov", lastName: "Ермилов", firstName: "Дмитрий", middleName: "Михайлович", role: "manager", dept: "admin", position: "Руководитель отдела анимации", prodScope: "studio" },
    { login: "ermilov.mv", lastName: "Ермилов", firstName: "Михаил", middleName: "Владимирович", role: "manager", dept: "admin", position: "Генеральный директор", prodScope: "studio", create: true },
    { login: "mitrofanov", lastName: "Митрофанов", firstName: "Тимофей", middleName: "Николаевич", role: "employee", dept: "prod", position: "3D-моделлер" },
    { login: "radle", lastName: "Радле-Десятник", firstName: "Максим", middleName: "Константинович", role: "employee", dept: "prod", position: "VFX-художник" },
    { login: "balova", lastName: "Балова", firstName: "Ирина", middleName: "Александровна", role: "employee", dept: "hr", position: "Специалист по кадрам", create: true },
    { login: "belyaeva", lastName: "Беляева", firstName: "Ксения", middleName: "Игоревна", role: "manager", dept: "prod", position: "Художественный руководитель", prodScope: "studio", create: true },
    { login: "katunin", lastName: "Катунин", firstName: "Алексей", middleName: "Андреевич", role: "employee", dept: "ii", position: "Программист", create: true },
    { login: "koropets", lastName: "Коропец", firstName: "Илья", middleName: "Александрович", role: "employee", dept: "script", position: "Ассистент сценариста", create: true },
    { login: "chetverikova", lastName: "Четверикова", firstName: "Ксения", middleName: "Александровна", role: "employee", dept: "anim", position: "Художник-аниматор", create: true },
  ];

  // Ermilov position should stay "Руководитель" conceptually — keep a studio lead title
  const studioLead = await upsertPos("Руководитель студии");
  const hash = hashPassword(TEMP);

  for (const s of staff) {
    const role = roles[s.role];
    if (!role) throw new Error("no role " + s.role);
    const existing = await prisma.user.findUnique({ where: { login: s.login } });
    const positionId = s.login === "ermilov" ? studioLead.id : pos[s.position].id;
    const data = {
      lastName: s.lastName,
      firstName: s.firstName,
      middleName: s.middleName,
      roleId: role.id,
      departmentId: s.dept ? depts[s.dept].id : null,
      positionId,
      prodScope: s.prodScope || "",
    };
    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data });
    } else if (s.create) {
      await prisma.user.create({
        data: {
          login: s.login,
          passwordHash: hash,
          mustChangePassword: true,
          ...data,
        },
      });
      console.log("created", s.login, "temp", TEMP);
    } else {
      console.log("skip missing", s.login);
    }
  }

  await importSheets();
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n") {
      row.push(cur.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur || row.length) {
    row.push(cur.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}

async function importSheets() {
  const sid = "1UgARqbS2E7f0eKBRq4hd2zfioLLj-NLrC4ouGMg7bRQ";
  const users = await prisma.user.findMany({ where: { deletedAt: null } });
  const byLogin = Object.fromEntries(users.map((u) => [u.login, u]));

  const show = await prisma.show.upsert({
    where: { code: "SG" },
    update: { name: "Суперглазка" },
    create: { code: "SG", name: "Суперглазка" },
  });
  const episode = await prisma.episode.upsert({
    where: { showId_code: { showId: show.id, code: "E02" } },
    update: { name: "Серия 2", diskPath: `${shareRoot()}/Data/E02` },
    create: { showId: show.id, code: "E02", name: "Серия 2", diskPath: `${shareRoot()}/Data/E02` },
  });

  await importAnim(sid, episode.id, byLogin);
  await import3d(sid, episode.id, byLogin);
}

async function fetchCsv(sid: string, gid: string) {
  const url = `https://docs.google.com/spreadsheets/d/${sid}/export?format=csv&gid=${gid}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("sheet " + gid + " " + res.status);
  return parseCsv(await res.text());
}

function cell(row: string[], i: number) {
  return (row[i] || "").trim();
}

async function upsertTask(data: {
  kind: string;
  stage: string;
  status: string;
  complexity: number;
  dueAt: Date | null;
  comment: string;
  blockedReason: string;
  diskDir: string;
  sheetCode: string;
  sceneId?: string | null;
  shotId?: string | null;
  assetId?: string | null;
  assigneeId?: string | null;
}) {
  const existing = await prisma.task.findFirst({
    where: {
      stage: data.stage,
      sceneId: data.sceneId || null,
      shotId: data.shotId || null,
      assetId: data.assetId || null,
    },
  });
  const payload = {
    kind: data.kind,
    status: data.status,
    complexity: data.complexity,
    dueAt: data.dueAt,
    comment: data.comment,
    blockedReason: data.blockedReason,
    diskDir: data.diskDir,
    sheetCode: data.sheetCode,
    assigneeId: data.assigneeId || null,
  };
  if (existing) {
    await prisma.task.update({ where: { id: existing.id }, data: payload });
    return existing.id;
  }
  const created = await prisma.task.create({
    data: {
      ...payload,
      stage: data.stage,
      sceneId: data.sceneId || null,
      shotId: data.shotId || null,
      assetId: data.assetId || null,
    },
  });
  return created.id;
}

async function importAnim(sid: string, episodeId: string, byLogin: Record<string, { id: string }>) {
  const rows = await fetchCsv(sid, "1095743431");
  let scene: { id: string; code: string; diskPath: string } | null = null;
  let shotOrder = 0;
  let sceneOrder = 0;

  for (const row of rows) {
    const c = cell(row, 2);
    const loc = cell(row, 3);
    const desc = cell(row, 4);
    const who = cell(row, 5);
    const anim = cell(row, 6);
    const lips = cell(row, 7);
    const emo = cell(row, 8);
    const due = parseSheetDate(cell(row, 9));
    const comment = cell(row, 11);
    const dirHint = cell(row, 12);

    if (c.startsWith("Сцена ")) {
      sceneOrder += 1;
      shotOrder = 0;
      const code = `SC${String(sceneOrder).padStart(2, "0")}`;
      const title = c.replace(/^Сцена\s+\d+\s*[-–—]?\s*/, "") || c;
      const rec = await prisma.scene.upsert({
        where: { episodeId_code: { episodeId, code } },
        update: { title, sortOrder: sceneOrder },
        create: { episodeId, code, title, sortOrder: sceneOrder },
      });
      scene = { id: rec.id, code, diskPath: rec.diskPath };
      continue;
    }
    if (c.startsWith("Персонажи:")) {
      if (scene) {
        const disk = fromWinPath(dirHint) ? `${shareRoot()}/${fromWinPath(dirHint)}` : scene.diskPath;
        const rec = await prisma.scene.update({
          where: { id: scene.id },
          data: { charactersNote: c, diskPath: disk },
        });
        scene.diskPath = rec.diskPath;
      }
      continue;
    }
    if (c === "Сегмент") continue;
    if (!scene) continue;

    if (!c && who && (anim || lips || desc.toLowerCase().includes("аниматик"))) {
      const title = desc || "Аниматик";
      const isAnimatic = /аниматик/i.test(title) || /аниматик/i.test(who + anim);
      const stage = isAnimatic ? "animatic" : "blocking";
      const logins = loginsFromSheet(who);
      await upsertTask({
        kind: "scene",
        stage,
        status: parseSheetStatus(anim),
        complexity: STAGE_COMPLEXITY[stage],
        dueAt: due,
        comment: comment || cell(row, 11),
        blockedReason: "",
        diskDir: `${shareRoot()}/Data/E02/${scene.code}/2D/animatic/playblast`,
        sheetCode: title,
        sceneId: scene.id,
        assigneeId: logins[0] ? byLogin[logins[0]]?.id : null,
      });
      continue;
    }

    if (/^shot[_ ]?\d+/i.test(c) || c === "Блокинг") {
      shotOrder += 1;
      const code = c === "Блокинг" ? "Blocking" : c.replace(" ", "_");
      const shot = await prisma.shot.upsert({
        where: { sceneId_code: { sceneId: scene.id, code } },
        update: { location: loc, description: desc, sortOrder: shotOrder },
        create: {
          sceneId: scene.id,
          code,
          location: loc,
          description: desc,
          sortOrder: shotOrder,
          workPath: `${shareRoot()}/Data/E02/${scene.code}/3D/Animation`,
        },
      });
      const stages =
        c === "Блокинг"
          ? (["blocking"] as const)
          : SHOT_STAGES;
      const vals = c === "Блокинг" ? [anim] : [anim, lips, emo];
      const logins = loginsFromSheet(who);
      const blocked = /ждём|ждем/i.test(comment) ? comment : "";
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        await upsertTask({
          kind: "shot",
          stage,
          status: blocked && parseSheetStatus(vals[i]) === "todo" ? "blocked" : parseSheetStatus(vals[i]),
          complexity: STAGE_COMPLEXITY[stage],
          dueAt: due,
          comment,
          blockedReason: blocked,
          diskDir: `${shareRoot()}/Data/E02/${scene.code}/3D/Animation/${shot.code}/${stage === "animation" ? "playblast" : stage}`,
          sheetCode: `${scene.code}/${shot.code}/${stage}`,
          sceneId: scene.id,
          shotId: shot.id,
          assigneeId: logins[0] ? byLogin[logins[0]]?.id : null,
        });
      }
    }
  }
  console.log("anim imported");
}

async function import3d(sid: string, episodeId: string, byLogin: Record<string, { id: string }>) {
  const rows = await fetchCsv(sid, "1046173764");
  let group = "";
  let inCharacters = true;
  let order = 0;
  let sectionDisk = "";

  for (const row of rows) {
    const taskName = cell(row, 2);
    const desc = cell(row, 3);
    const modelWho = cell(row, 4);
    const modelSt = cell(row, 5);
    const comment = cell(row, 6);
    const due = parseSheetDate(cell(row, 7));
    const disk = cell(row, 8);
    const refs = cell(row, 9);
    const rigWho = cell(row, 10);
    const rigSt = cell(row, 11);
    const rigDue = parseSheetDate(cell(row, 12));
    const texWho = cell(row, 13);
    const texDue = parseSheetDate(cell(row, 14));
    const texSt = cell(row, 15);

    if (!taskName && !modelWho) {
      const joined = row.join(" ");
      if (/персонаж/i.test(joined)) inCharacters = true;
      if (/локац/i.test(joined) || /планета/i.test(joined) || /кабинет/i.test(joined) || /пещер/i.test(joined) || /комната/i.test(joined)) {
        inCharacters = false;
      }
      continue;
    }
    if (taskName === "Задача") continue;
    if (!taskName) continue;

    if (/^аркит/i.test(taskName)) {
      // attach rig to last character body in group
      const last = await prisma.asset.findFirst({
        where: { episodeId, groupName: group || "Прочее" },
        orderBy: { sortOrder: "desc" },
      });
      if (last) {
        const logins = loginsFromSheet(modelWho);
        await upsertTask({
          kind: "asset",
          stage: "rig",
          status: parseSheetStatus(modelSt),
          complexity: STAGE_COMPLEXITY.rig,
          dueAt: due,
          comment,
          blockedReason: "",
          diskDir: last.diskPath || `${shareRoot()}/Data/Global/3D/Characters`,
          sheetCode: `${last.name}/rig`,
          assetId: last.id,
          assigneeId: logins[0] ? byLogin[logins[0]]?.id : null,
        });
      }
      continue;
    }

    if (disk) sectionDisk = fromWinPath(disk);

    if (/^супerglazka|^суперглазка|^тренер|^костя|^тишинистер|^учительница|^лена|^ваня|^врач|^родители|^друзья|^сгорбленные/i.test(taskName)) {
      group = taskName.split(".")[0].trim();
      inCharacters = true;
    }
    if (isLocationAssetName(taskName)) {
      group = taskName;
      inCharacters = false;
    }

    order += 1;
    const assetKind: "character" | "location" | "prop" =
      inCharacters && !isLocationAssetName(taskName) ? "character" : reclassifyAssetKind(taskName, "prop");
    if (assetKind !== "character") inCharacters = false;
    const diskPath = sectionDisk ? `${shareRoot()}/${sectionDisk}` : refs ? `${shareRoot()}/${fromWinPath(refs)}` : "";
    const existingAsset = await prisma.asset.findFirst({ where: { episodeId, name: taskName } });
    const asset = existingAsset
      ? await prisma.asset.update({
          where: { id: existingAsset.id },
          data: { kind: assetKind, groupName: group || "Прочее", description: desc, diskPath, sortOrder: order },
        })
      : await prisma.asset.create({
          data: {
            episodeId,
            kind: assetKind,
            groupName: group || "Прочее",
            name: taskName,
            description: desc,
            diskPath,
            sortOrder: order,
          },
        });

    const stages = asset.kind === "location" || asset.kind === "prop" ? LOCATION_STAGES : CHARACTER_STAGES;
    const packs: Array<{ stage: string; who: string; st: string; due: Date | null }> = [
      { stage: "model", who: modelWho, st: modelSt, due },
    ];
    if (stages.includes("rig" as never) || CHARACTER_STAGES.includes("rig" as never)) {
      if (asset.kind === "character") packs.push({ stage: "rig", who: rigWho, st: rigSt, due: rigDue });
    }
    packs.push({ stage: "texture", who: texWho, st: texSt, due: texDue });

    for (const p of packs) {
      if (asset.kind !== "character" && p.stage === "rig") continue;
      const logins = loginsFromSheet(p.who);
      const status = parseSheetStatus(p.st || p.who);
      if (!p.who && !p.st) continue;
      await upsertTask({
        kind: "asset",
        stage: p.stage,
        status,
        complexity: STAGE_COMPLEXITY[p.stage] || 3,
        dueAt: p.due,
        comment,
        blockedReason: "",
        diskDir: asset.diskPath || `${shareRoot()}/Data/Global/3D`,
        sheetCode: `${asset.name}/${p.stage}`,
        assetId: asset.id,
        assigneeId: logins[0] ? byLogin[logins[0]]?.id : null,
      });
    }
  }
  console.log("3d imported");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

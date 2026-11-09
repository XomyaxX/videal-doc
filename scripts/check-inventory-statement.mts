/**
 * Ведомость тура и перепись ТМЦ.
 * Запуск: npm run check:inventory-statement
 * Пишет PDF, XLSX и PNG первой страницы в /opt/cursor/artifacts, если каталог есть,
 * и всегда в ./tmp-statement-artifacts рядом с репозиторием не кладёт — только в argv-каталог
 * или /tmp/inventory-statement-artifacts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import {
  buildInventoryStatement,
  matchInventoryQuery,
  planItemReassign,
  FOUND_ELSEWHERE,
  type StatementAuditIn,
} from "../src/lib/inventory-statement";

const root = fileURLToPath(new URL("..", import.meta.url));
const artifactDir = process.env.STATEMENT_ARTIFACTS || "/opt/cursor/artifacts";
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`ok  ${name}`);
    return;
  }
  failed++;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const item = { id: "chair", deletedAt: null, userId: "sidorov", status: "ok" };
const active = { id: "petrov", status: "active", deletedAt: null };
const dismissed = planItemReassign({
  auditStatus: "open",
  auditUserId: "ivanov",
  recipient: { id: "fired", status: "dismissed", deletedAt: null },
  item,
  lineHereId: null,
  otherOpen: [],
});
check("уволенному получателю нельзя", !dismissed.ok && dismissed.error.includes("действующему"));

const deleted = planItemReassign({
  auditStatus: "open",
  auditUserId: "ivanov",
  recipient: { id: "fired", status: "active", deletedAt: new Date() },
  item,
  lineHereId: null,
  otherOpen: [],
});
check("удалённому получателю нельзя", !deleted.ok);

const own = planItemReassign({
  auditStatus: "open",
  auditUserId: "ivanov",
  recipient: active,
  item: { ...item, userId: "ivanov" },
  lineHereId: "line-1",
  otherOpen: [],
});
check("своя вещь — обычная передача, без «найдено у другого»", own.ok && own.foundElsewhere === false && own.create === false);

const other = planItemReassign({
  auditStatus: "open",
  auditUserId: "ivanov",
  recipient: active,
  item,
  lineHereId: null,
  otherOpen: [{ lineId: "other-line", auditId: "audit-b", auditNumber: "ИНВ-2026-0002" }],
});
check(
  "чужая вещь добавляется строкой и помечает другой открытый обход",
  other.ok && other.foundElsewhere && other.create && other.otherOpen.length === 1,
);

check("поиск по номеру", matchInventoryQuery({ invNo: "ИНВ-002", name: "Ноутбук", pcHost: "PC-PETROV" }, "002"));
check("поиск по имени ПК", matchInventoryQuery({ invNo: "ИНВ-002", name: "Ноутбук", pcHost: "PC-PETROV" }, "pc-petrov"));
check("поиск по наименованию", matchInventoryQuery({ invNo: "1", name: "Монитор", pcHost: "" }, "мони"));
check("пустой запрос не ищет", !matchInventoryQuery({ invNo: "1", name: "Монитор", pcHost: "" }, "  "));

const preview = buildInventoryStatement({
  scope: "round",
  interim: true,
  org: "ООО «Видеаль Медиа»",
  inn: "5503283435",
  number: "ТУР-2026-0001",
  startedAt: "9 ноября 2026 г.",
  closedAt: "не закрыт",
  conductor: "Кладов Тест",
  employees: [
    { id: "ivanov", name: "Иванов Тест", department: "" },
    { id: "sidorov", name: "Сидоров Тест", department: "Цех" },
  ],
  names: { petrov: "Петров Тест" },
  audits: [
    {
      id: "a",
      number: "ИНВ-1",
      status: "open",
      userId: "ivanov",
      userName: "Иванов Тест",
      department: "",
      lines: [
        {
          inventoryItemId: "chair",
          title: "Стул",
          invNo: "003",
          qty: 1,
          action: "transfer",
          toUserId: "petrov",
          note: `${FOUND_ELSEWHERE}: от Сидоров Тест`,
        },
      ],
    } satisfies StatementAuditIn,
  ],
});
check(
  "ведомость: передано от кого к кому",
  preview.people[0].lines[0].result === "Передано: Сидоров Тест → Петров Тест" && preview.totals.transfer === 1,
  preview.people[0].lines[0].result,
);
check("незакрытый сотрудник в списке непроверенных", preview.unchecked.some((row) => row.name.startsWith("Иванов") && row.state === "open"));
check("неначатый сотрудник в списке непроверенных", preview.unchecked.some((row) => row.name.startsWith("Сидоров") && row.state === "pending"));

async function main() {
const dbDir = mkdtempSync(join(tmpdir(), "inv-statement-"));
const dbFile = join(dbDir, "app.db");
process.env.DATABASE_URL = `file:${dbFile}`;
execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
  cwd: root,
  env: process.env,
  stdio: "inherit",
});

const { PrismaClient } = await import("@prisma/client");
const { reassignInventoryItem, loadRoundStatement, searchInventoryItems } = await import("../src/lib/inventory-statement-server");
const { renderInventoryStatementXlsx } = await import("../src/lib/inventory-statement-xlsx");

const prisma = new PrismaClient();
const role = await prisma.role.create({ data: { code: "sheet-staff", name: "Сотрудник", permissions: "[]" } });

async function person(login: string, last: string, status: string, deletedAt: Date | null) {
  return prisma.user.create({
    data: {
      login,
      passwordHash: "x",
      lastName: last,
      firstName: "Тест",
      roleId: role.id,
      status,
      deletedAt,
      mustChangePassword: false,
    },
  });
}

const clerk = await person("clerk-sheet", "Кладов", "active", null);
const ivanov = await person("ivanov-sheet", "Иванов", "active", null);
const petrov = await person("petrov-sheet", "Петров", "active", null);
const sidorov = await person("sidorov-sheet", "Сидоров", "active", null);
const fired = await person("fired-sheet", "Уволеннов", "dismissed", null);

const monitor = await prisma.inventoryItem.create({ data: { name: "Монитор", invNo: "ИНВ-001", userId: ivanov.id, qty: 1 } });
const laptop = await prisma.inventoryItem.create({
  data: { name: "Ноутбук", invNo: "ИНВ-002", pcHost: "PC-PETROV", userId: petrov.id, qty: 1 },
});
const chair = await prisma.inventoryItem.create({ data: { name: "Стул", invNo: "ИНВ-003", userId: sidorov.id, qty: 1 } });

const round = await prisma.inventoryRound.create({ data: { number: "ТУР-2026-0099", userId: clerk.id, status: "open" } });
const auditIvanov = await prisma.inventoryAudit.create({
  data: {
    number: "ИНВ-2026-0101",
    userId: ivanov.id,
    authorId: clerk.id,
    roundId: round.id,
    status: "open",
    lines: {
      create: [{ inventoryItemId: monitor.id, title: "Монитор", invNo: monitor.invNo, qty: 1, action: "found", sortOrder: 0 }],
    },
  },
});
const auditPetrov = await prisma.inventoryAudit.create({
  data: {
    number: "ИНВ-2026-0102",
    userId: petrov.id,
    authorId: clerk.id,
    roundId: round.id,
    status: "open",
    lines: {
      create: [{ inventoryItemId: laptop.id, title: "Ноутбук (PC-PETROV)", invNo: laptop.invNo, qty: 1, action: "", sortOrder: 0 }],
    },
  },
});

let rejected = "";
try {
  await reassignInventoryItem({ auditId: auditIvanov.id, inventoryItemId: chair.id, toUserId: fired.id, actorId: clerk.id });
} catch (error) {
  rejected = error instanceof Error ? error.message : "";
}
check("сервер отклоняет уволенного получателя", rejected.includes("действующему"), rejected);

const movedChair = await reassignInventoryItem({
  auditId: auditIvanov.id,
  inventoryItemId: chair.id,
  toUserId: petrov.id,
  actorId: clerk.id,
});
check("стул найден у другого", movedChair.foundElsewhere && movedChair.line.note.startsWith(FOUND_ELSEWHERE), movedChair.line.note);

const movedLaptop = await reassignInventoryItem({
  auditId: auditIvanov.id,
  inventoryItemId: laptop.id,
  toUserId: ivanov.id,
  actorId: clerk.id,
});
check(
  "ноутбук снят с другого открытого обхода",
  movedLaptop.foundElsewhere && movedLaptop.otherAuditNumbers.includes(auditPetrov.number),
  movedLaptop.otherAuditNumbers.join(","),
);

const found = await searchInventoryItems("pc-petrov");
check("поиск по хосту ПК на базе", found.length === 1 && found[0].invNo === "ИНВ-002" && found[0].holder.startsWith("Иванов"), JSON.stringify(found));
const byNumber = await searchInventoryItems("003");
check("поиск по номеру на базе", byNumber.some((row) => row.name === "Стул" && row.holder.startsWith("Петров")));

const reassignLogs = await prisma.auditLog.count({ where: { action: "inventory.audit.reassign" } });
check("в журнал записана перепись", reassignLogs >= 2, String(reassignLogs));

const statement = await loadRoundStatement(round.id);
if (!statement) {
  check("ведомость собралась", false);
} else {
  const ivanovBlock = statement.people.find((row) => row.userId === ivanov.id);
  const petrovBlock = statement.people.find((row) => row.userId === petrov.id);
  const chairLine = ivanovBlock?.lines.find((line) => line.invNo === "ИНВ-003");
  const laptopEcho = petrovBlock?.lines.find((line) => line.invNo === "ИНВ-002");
  check("передача стула: Сидоров → Петров", chairLine?.result === "Передано: Сидоров Тест → Петров Тест", chairLine?.result);
  check("эхо в обходе Петрова не входит в итог", laptopEcho?.kind === "echo" && laptopEcho.countInTotals === false);
  check("итог: 1 соответствует и 2 передачи", statement.totals.match === 1 && statement.totals.transfer === 2, JSON.stringify(statement.totals));
  check("Сидоров не начат", statement.unchecked.some((row) => row.name.startsWith("Сидоров") && row.state === "pending"));
  check("Иванов ещё идёт", statement.unchecked.some((row) => row.name.startsWith("Иванов") && row.state === "open"));
  check("уволенный не в списке непроверенных", !statement.unchecked.some((row) => row.name.startsWith("Уволеннов")));
  check("ведомость помечена промежуточной", statement.interim);

  const { Module } = await import("node:module");
  const hooks = Module as unknown as {
    _resolveFilename: (this: unknown, request: string, parent: unknown, isMain?: boolean, options?: unknown) => string;
  };
  const resolve = hooks._resolveFilename;
  hooks._resolveFilename = function (this: unknown, request: string, parent: unknown, isMain?: boolean, options?: unknown) {
    if (request.startsWith("@react-pdf/hyphenate/") && !request.includes("/lib/")) {
      const lang = request.slice("@react-pdf/hyphenate/".length);
      return join(root, "node_modules/@react-pdf/hyphenate/lib", `${lang}.js`);
    }
    return resolve.call(this, request, parent, isMain, options);
  };
  const { renderInventoryStatementPdf } = await import("../src/lib/pdf/render");
  const pdf = await renderInventoryStatementPdf(statement);
  const xlsx = await renderInventoryStatementXlsx(statement);
  check("pdf не пустой", pdf.subarray(0, 4).toString() === "%PDF" && pdf.length > 2000, String(pdf.length));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(xlsx as unknown as ExcelJS.Buffer);
  check(
    "xlsx: три листа",
    ["Ведомость", "Итоги", "Не проверены"].every((name) => book.getWorksheet(name)),
    book.worksheets.map((sheet) => sheet.name).join(","),
  );
  const grid = book.getWorksheet("Ведомость");
  const text = grid ? grid.getSheetValues().flat().join(" ") : "";
  check("xlsx содержит передачу", text.includes("Передано: Сидоров Тест → Петров Тест"));

  mkdirSync(artifactDir, { recursive: true });
  const pdfPath = join(artifactDir, "inventory-round-statement.pdf");
  const xlsxPath = join(artifactDir, "inventory-round-statement.xlsx");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(pdfPath, pdf);
  writeFileSync(xlsxPath, xlsx);
  try {
    execFileSync("pdftoppm", ["-png", "-f", "1", "-l", "1", "-singlefile", pdfPath, join(artifactDir, "inventory-round-statement-page1")], {
      stdio: "inherit",
    });
    check("png первой страницы", true);
  } catch {
    check("png первой страницы", false, "pdftoppm");
  }
  console.log(`artifacts ${pdfPath}`);
}

await prisma.$disconnect();
}

main().then(() => {
  if (failed) {
    console.error(`\n${failed} проверок не прошли`);
    process.exit(1);
  }
  console.log("\nведомость и перепись: все проверки прошли");
});

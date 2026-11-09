/**
 * Проверка логики тура обхода без поднятия Next.
 * Запуск из корня: npx tsx scripts/check-inventory-round.ts
 *
 * 1) чистые правила: фильтр непроверенных, resume open, «Далее», отказ уволенному;
 * 2) SQL миграции на временной SQLite: старый аудит жив, второй открытый тур запрещён, откат.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRoundRoster,
  decideAuditStart,
  decideRoundStart,
  employeeBlockReason,
  isActiveEmployee,
  nextUnchecked,
  type RoundAuditRef,
  type RoundPerson,
} from "../src/lib/inventory-round";

const root = fileURLToPath(new URL("..", import.meta.url));
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`ok  ${name}`);
    return;
  }
  failed++;
  console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
}

const active = { status: "active", deletedAt: null };
const dismissed = { status: "dismissed", deletedAt: null };
const deleted = { status: "dismissed", deletedAt: new Date("2026-01-01") };
const deletedActive = { status: "active", deletedAt: new Date("2026-01-02") };

check("уволенный не active", !isActiveEmployee(dismissed));
check("удалённый не active", !isActiveEmployee(deletedActive));
check("действующий active", isActiveEmployee(active));
check("нет записи — не active", !isActiveEmployee(null));

const rejectedDismissed = decideAuditStart({
  person: dismissed,
  openRoundId: "r1",
  openAudit: null,
  doneInOpenRound: false,
});
check(
  "субъект уволен (status != active)",
  rejectedDismissed.type === "reject" &&
    rejectedDismissed.error === "Сотрудник не работает — инвентаризацию по нему не открываем",
);
const rejectedDeleted = decideAuditStart({
  person: deleted,
  openRoundId: null,
  openAudit: null,
  doneInOpenRound: false,
});
check("субъект с deletedAt отклонён", rejectedDeleted.type === "reject");
check(
  "субъект удалён",
  employeeBlockReason(deletedActive, "subject") === "Выберите сотрудника",
);
check(
  "получатель уволен",
  employeeBlockReason(dismissed, "recipient") === "Передать можно только действующему сотруднику",
);
check("получатель действующий", employeeBlockReason(active, "recipient") === null);

const noRound = decideAuditStart({ person: active, openRoundId: null, openAudit: null, doneInOpenRound: false });
check("без тура создаём аудит без roundId", noRound.type === "create" && noRound.roundId === null);

const withRound = decideAuditStart({ person: active, openRoundId: "r1", openAudit: null, doneInOpenRound: false });
check("в туре новый аудит получает roundId", withRound.type === "create" && withRound.roundId === "r1");

const resumed = decideAuditStart({
  person: active,
  openRoundId: "r1",
  openAudit: { id: "a-open", roundId: null },
  doneInOpenRound: false,
});
check(
  "resume open и привязка к туру",
  resumed.type === "resume" && resumed.auditId === "a-open" && resumed.setRoundId === "r1",
);

const resumedSame = decideAuditStart({
  person: active,
  openRoundId: "r1",
  openAudit: { id: "a-open", roundId: "r1" },
  doneInOpenRound: false,
});
check(
  "resume уже в этом туре не переписывает roundId",
  resumedSame.type === "resume" && resumedSame.setRoundId === null,
);

const again = decideAuditStart({
  person: active,
  openRoundId: "r1",
  openAudit: null,
  doneInOpenRound: true,
});
check("повторно в том же туре нельзя", again.type === "reject" && again.status === 409);

const secondRound = decideRoundStart({ id: "r1" });
check("второй открытый тур запрещён", !secondRound.ok && secondRound.status === 409);
check("первый тур можно открыть", decideRoundStart(null).ok);

const people: RoundPerson[] = [
  { id: "a", name: "Андреев" },
  { id: "b", name: "Борисов" },
  { id: "c", name: "Васильев" },
  { id: "d", name: "Громов" },
];
const audits: RoundAuditRef[] = [
  { id: "done-a", userId: "a", status: "done", roundId: "r1" },
  { id: "open-b", userId: "b", status: "open", roundId: "r1" },
  { id: "old-c", userId: "c", status: "done", roundId: null },
  { id: "other-d", userId: "d", status: "done", roundId: "old-round" },
];
const roster = buildRoundRoster(people, audits, "r1");
check(
  "фильтр: pending c и d, open b, done a",
  roster.pending.map((p) => p.id).join(",") === "c,d" &&
    roster.inProgress.map((p) => p.id).join(",") === "b" &&
    roster.done.map((p) => p.id).join(",") === "a" &&
    roster.checked === 1 &&
    roster.total === 4,
  JSON.stringify({ pending: roster.pending.map((p) => p.id), open: roster.inProgress.map((p) => p.id), done: roster.done.map((p) => p.id) }),
);

const nextFromA = nextUnchecked(people, audits, "r1", "a");
check("Далее после закрытого a — открытый b", nextFromA?.userId === "b" && nextFromA.auditId === "open-b");

const afterBDone: RoundAuditRef[] = [
  { id: "done-a", userId: "a", status: "done", roundId: "r1" },
  { id: "done-b", userId: "b", status: "done", roundId: "r1" },
  { id: "old-c", userId: "c", status: "done", roundId: null },
];
const nextFromB = nextUnchecked(people, afterBDone, "r1", "b");
check("Далее пропускает старый done без тура и идёт к c", nextFromB?.userId === "c" && nextFromB.auditId === null);

const allDone: RoundAuditRef[] = people.map((p) => ({ id: `d-${p.id}`, userId: p.id, status: "done", roundId: "r1" }));
check("все проверены — Далее нет", nextUnchecked(people, allDone, "r1", "d") === null);
check("проверено 4 из 4", buildRoundRoster(people, allDone, "r1").checked === 4);

const dir = mkdtempSync(join(tmpdir(), "inv-round-"));
const db = join(dir, "app.db");
const applySql = readFileSync(join(root, "prisma/manual/20261109120000_inventory_rounds.sql"), "utf8");
const rollbackSql = readFileSync(join(root, "prisma/manual/20261109120000_inventory_rounds.rollback.sql"), "utf8");

function sqlite(sql: string) {
  return execFileSync("sqlite3", [db], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

sqlite(`
CREATE TABLE "User" (id TEXT PRIMARY KEY);
INSERT INTO "User" (id) VALUES ('u1');
CREATE TABLE "InventoryAudit" (
  id TEXT PRIMARY KEY,
  number TEXT NOT NULL,
  userId TEXT NOT NULL,
  authorId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT NOT NULL DEFAULT ''
);
INSERT INTO "InventoryAudit" (id, number, userId, authorId, status) VALUES ('a1', 'ИНВ-2026-0001', 'u1', 'u1', 'done');
`);
sqlite(applySql);
const kept = sqlite("SELECT id || '|' || number || '|' || IFNULL(roundId, 'NULL') FROM InventoryAudit;").trim();
check("старый аудит на месте и без тура", kept === "a1|ИНВ-2026-0001|NULL", kept);
const hasRound = sqlite("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'InventoryRound';").trim();
check("таблица InventoryRound создана", hasRound === "InventoryRound");
const col = sqlite("SELECT COUNT(*) FROM pragma_table_info('InventoryAudit') WHERE name = 'roundId';").trim();
check("колонка roundId добавлена", col === "1", col);

sqlite(
  "INSERT INTO InventoryRound (id, number, userId, status, updatedAt) VALUES ('r1', 'ТУР-2026-0001', 'u1', 'open', CURRENT_TIMESTAMP);",
);
let secondOpenFailed = false;
try {
  sqlite(
    "INSERT INTO InventoryRound (id, number, userId, status, updatedAt) VALUES ('r2', 'ТУР-2026-0002', 'u1', 'open', CURRENT_TIMESTAMP);",
  );
} catch {
  secondOpenFailed = true;
}
check("SQL не даёт второй open тур", secondOpenFailed);
sqlite("UPDATE InventoryRound SET status = 'done', closedAt = CURRENT_TIMESTAMP WHERE id = 'r1';");
sqlite(
  "INSERT INTO InventoryRound (id, number, userId, status, updatedAt) VALUES ('r2', 'ТУР-2026-0002', 'u1', 'open', CURRENT_TIMESTAMP);",
);
const openCount = sqlite("SELECT COUNT(*) FROM InventoryRound WHERE status = 'open';").trim();
check("после закрытия можно открыть следующий", openCount === "1", openCount);

sqlite("UPDATE InventoryAudit SET roundId = 'r2' WHERE id = 'a1';");
sqlite(rollbackSql);
const afterRollback = sqlite("SELECT id || '|' || number || '|' || status FROM InventoryAudit;").trim();
check("откат сохраняет аудит", afterRollback === "a1|ИНВ-2026-0001|done", afterRollback);
const roundGone = sqlite("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'InventoryRound';").trim();
check("откат снимает таблицу тура", roundGone === "0", roundGone);
let columnGone = false;
try {
  sqlite("SELECT roundId FROM InventoryAudit;");
} catch {
  columnGone = true;
}
check("откат снимает колонку roundId", columnGone);

rmSync(dir, { recursive: true, force: true });

if (failed) {
  console.error(`\n${failed} проверок не прошли`);
  process.exit(1);
}
console.log("\nтур обхода: все проверки прошли");

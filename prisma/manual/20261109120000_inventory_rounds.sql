-- Тур обхода инвентаризации. Аддитивно: новая таблица и колонка,
-- без пересоздания InventoryAudit. Старые аудиты остаются с roundId = NULL.
-- Одновременно открыт максимум один тур (частичный уникальный индекс).

CREATE TABLE "InventoryRound" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryRound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "InventoryRound_number_key" ON "InventoryRound"("number");

CREATE INDEX "InventoryRound_status_idx" ON "InventoryRound"("status");

CREATE INDEX "InventoryRound_userId_idx" ON "InventoryRound"("userId");

CREATE UNIQUE INDEX "InventoryRound_one_open" ON "InventoryRound"("status") WHERE "status" = 'open';

ALTER TABLE "InventoryAudit" ADD COLUMN "roundId" TEXT REFERENCES "InventoryRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InventoryAudit_roundId_idx" ON "InventoryAudit"("roundId");

-- Откат тура. Аудиты (InventoryAudit) и их строки не удаляются.
-- SQLite 3.35+ (на проде 3.45). Колонка roundId и таблица тура снимаются.
-- Снимок БД перед откатом обязателен: связи аудитов с туром пропадут.

DROP INDEX IF EXISTS "InventoryAudit_roundId_idx";

ALTER TABLE "InventoryAudit" DROP COLUMN "roundId";

DROP TABLE IF EXISTS "InventoryRound";

-- Аддитивная миграция доски задач.
-- Только новые таблицы. Существующие таблицы и их данные не меняются.
-- Накатывать на офисную базу отдельно, вместе с решением владельца о выкладке.

-- CreateTable
CREATE TABLE "WorkBoardTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'todo',
    "assigneeId" TEXT,
    "authorId" TEXT,
    "posX" REAL NOT NULL DEFAULT 80,
    "posY" REAL NOT NULL DEFAULT 80,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkBoardTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WorkBoardTask_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WorkBoardEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'depends',
    "authorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkBoardEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "WorkBoardTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkBoardEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "WorkBoardTask" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkBoardEdge_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WorkBoardTask_assigneeId_status_idx" ON "WorkBoardTask"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "WorkBoardTask_deletedAt_sortOrder_idx" ON "WorkBoardTask"("deletedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "WorkBoardEdge_toId_idx" ON "WorkBoardEdge"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkBoardEdge_fromId_toId_key" ON "WorkBoardEdge"("fromId", "toId");

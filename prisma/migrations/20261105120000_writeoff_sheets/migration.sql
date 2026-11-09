-- CreateTable
CREATE TABLE "WriteOffSheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "number" TEXT NOT NULL,
    "actDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'unusable',
    "reasonText" TEXT NOT NULL DEFAULT '',
    "basis" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "commissionJson" TEXT NOT NULL DEFAULT '[]',
    "printJson" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'open',
    "closedAt" DATETIME,
    "closedById" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WriteOffSheet_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WriteOffLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "invNo" TEXT NOT NULL DEFAULT '',
    "qty" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "prevUserId" TEXT NOT NULL DEFAULT '',
    "prevHolderName" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "WriteOffLine_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "WriteOffSheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WriteOffSheet_number_key" ON "WriteOffSheet"("number");

-- CreateIndex
CREATE INDEX "WriteOffSheet_status_idx" ON "WriteOffSheet"("status");

-- CreateIndex
CREATE INDEX "WriteOffSheet_authorId_idx" ON "WriteOffSheet"("authorId");

-- CreateIndex
CREATE INDEX "WriteOffLine_sheetId_idx" ON "WriteOffLine"("sheetId");

-- CreateIndex
CREATE INDEX "WriteOffLine_inventoryItemId_idx" ON "WriteOffLine"("inventoryItemId");

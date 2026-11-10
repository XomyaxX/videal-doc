-- Аддитивное расширение доски задач.
-- Новые столбцы у WorkBoardTask. Строки сотрудников, ролей, отделов и производственных задач не меняются.

ALTER TABLE "WorkBoardTask" ADD COLUMN "staffUserId" TEXT;
ALTER TABLE "WorkBoardTask" ADD COLUMN "departmentId" TEXT;
ALTER TABLE "WorkBoardTask" ADD COLUMN "dueOn" TEXT NOT NULL DEFAULT '';
ALTER TABLE "WorkBoardTask" ADD COLUMN "prodTaskId" TEXT;

CREATE UNIQUE INDEX "WorkBoardTask_staffUserId_key" ON "WorkBoardTask"("staffUserId");
CREATE INDEX "WorkBoardTask_departmentId_idx" ON "WorkBoardTask"("departmentId");
CREATE INDEX "WorkBoardTask_prodTaskId_idx" ON "WorkBoardTask"("prodTaskId");

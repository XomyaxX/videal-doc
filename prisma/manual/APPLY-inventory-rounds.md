# Тур обхода инвентаризации — применение SQL

Файл `20261109120000_inventory_rounds.sql` совпадает с миграцией
`prisma/migrations/20261109120000_inventory_rounds/migration.sql`.

Миграция аддитивная: `CREATE TABLE InventoryRound` и
`ALTER TABLE InventoryAudit ADD COLUMN roundId`. Таблицы не пересоздаются,
существующие аудиты остаются, у них `roundId` будет `NULL`.

Нужен SQLite 3.37+ (проверено на 3.45): так `ADD COLUMN` принимает внешний ключ.

На проде схема заведена в основном без Prisma Migrate (в истории только
`20261105120000_writeoff_sheets`). Поэтому на живую базу накатывайте SQL
напрямую, а не `prisma migrate deploy`, если таблица `_prisma_migrations`
не ведёт полную историю схемы. `migrate deploy` имеет смысл только когда
база уже прогнана через migrate и в ней есть таблица `InventoryAudit`.

`prisma db push` колонку и таблицу создаст, но частичный уникальный индекс
«один открытый тур» в `schema.prisma` не описан (Prisma его не умеет).
Индекс есть только в этом SQL. Повторная проверка «один открытый тур» есть
и в коде (`decideRoundStart`).

## Перед применением

1. Остановить приложение, чтобы не было записей в аудиты в момент `ALTER`.
2. Снять копию файла базы, например:

```bash
cp data/videal.db "data/videal.db.bak-$(date +%Y%m%d%H%M)"
```

Путь к файлу — тот, что в `DATABASE_URL` (`file:...`).

## Применение

Из корня репозитория, один раз:

```bash
sqlite3 /путь/к/базе.db < prisma/manual/20261109120000_inventory_rounds.sql
```

Проверка:

```bash
sqlite3 /путь/к/базе.db "PRAGMA table_info(InventoryAudit);"
sqlite3 /путь/к/базе.db "SELECT name FROM sqlite_master WHERE type='table' AND name='InventoryRound';"
sqlite3 /путь/к/базе.db "SELECT COUNT(*) FROM InventoryAudit;"
```

В `InventoryAudit` должна появиться колонка `roundId`. Число аудитов не меняется.
Повторный запуск SQL упадёт на `CREATE TABLE` — это ожидаемо, второй раз не запускать.

После SQL перезапустить приложение со сборкой, в которой есть модель `InventoryRound`.

## Откат

Только после копии базы. Аудиты и строки аудита сохраняются, пропадает
привязка к турам и сама таблица туров.

```bash
sqlite3 /путь/к/базе.db < prisma/manual/20261109120000_inventory_rounds.rollback.sql
```

Код с моделью `InventoryRound` на базу без этой таблицы не встанет: откатывайте
приложение на коммит до этой ветки вместе с SQL, либо оставляйте SQL и откатывайте
только приложение, если колонка уже не мешает старой сборке. Старая сборка
Prisma не знает колонку `roundId`: лишняя колонка в SQLite обычно не ломает
чтение, но безопасный путь — откат SQL и откат приложения одним шагом, с копии базы.

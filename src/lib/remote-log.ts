import type { Prisma } from "@prisma/client";

export const REMOTE_LOG_LIMIT = 5000;

export const REMOTE_ACTION_LABEL: Record<string, string> = {
  login: "Вход",
  "library.file.view": "Открыл файл хранилища",
  "library.file.download": "Скачал файл хранилища",
  "file.view": "Открыл документ",
  "file.download": "Скачал документ",
  "library.share.on": "Включил публичную ссылку",
  "library.share.off": "Выключил публичную ссылку",
  "data.file.view": "Открыл файл Data",
  "data.file.download": "Скачал файл Data",
  "data.file.put": "Записал файл в Data",
  "data.folder": "Создал папку в Data",
  "data.rename": "Переименовал в Data",
  "data.trash": "Перенёс в корзину Data",
  "data.restore": "Восстановил из корзины Data",
  "data.links.view": "Смотрел связи .blend",
  "data.related.zip": "Скачал связанные файлы Data",
  "data.related.restore": "Вернул архив связанных Data",
};

export function parseRemoteLogFilters(sp: { user?: string; q?: string; action?: string }) {
  const userId = (sp.user || "").trim();
  const q = (sp.q || "").trim().slice(0, 80);
  const actionRaw = (sp.action || "").trim();
  const action = REMOTE_ACTION_LABEL[actionRaw] ? actionRaw : "";
  return { userId, q, action };
}

export function remoteLogWhere(opts: { userId?: string; q?: string; action?: string }): Prisma.AuditLogWhereInput {
  const userId = (opts.userId || "").trim();
  const q = (opts.q || "").trim().slice(0, 80);
  const action = REMOTE_ACTION_LABEL[opts.action || ""] ? opts.action : "";
  const qLower = q.toLocaleLowerCase("ru");
  return {
    AND: [
      { user: { role: { code: "remote" } } },
      userId ? { userId } : {},
      action ? { action } : {},
      q
        ? {
            OR: [
              { details: { contains: q } },
              { ip: { contains: q } },
              { action: { contains: q } },
              { entity: { contains: q } },
              { entityId: { contains: q } },
              { user: { lastName: { contains: q } } },
              { user: { firstName: { contains: q } } },
              { user: { login: { contains: q } } },
              ...Object.entries(REMOTE_ACTION_LABEL)
                .filter(([, label]) => label.toLocaleLowerCase("ru").includes(qLower))
                .map(([code]) => ({ action: code })),
            ],
          }
        : {},
    ],
  };
}

export function remoteLogTxtHref(opts: { user?: string; q?: string; action?: string }) {
  const p = new URLSearchParams();
  if (opts.user) p.set("user", opts.user);
  if (opts.q) p.set("q", opts.q);
  if (opts.action) p.set("action", opts.action);
  const s = p.toString();
  return s ? `/api/admin/remote-log?${s}` : "/api/admin/remote-log";
}

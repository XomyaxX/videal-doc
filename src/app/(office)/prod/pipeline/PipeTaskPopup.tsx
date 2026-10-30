"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TeamChat } from "@/components/TeamChat";
import { PIPE_MANAGER_STATUSES, PIPE_STATUS_LABEL, PIPE_WORKER_STATUSES, pipeLiveStatus, ymd } from "@/lib/pipe-board";
import "./pipeline-desk.css";

export type Person = { id: string; name: string };
export type FileChip = { id: string; name: string };
export type PipeTask = {
  id: string;
  title: string;
  status: string;
  brief: string;
  projectUrl: string;
  startsAt: string | null;
  dueAt: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeIds: string[];
  assigneeNames: string[];
  chapterId: string | null;
  groupId: string | null;
  files: FileChip[];
};
export type Chapter = { id: string; name: string; pct: number };
export type Group = { id: string; name: string; chapterId: string | null; memberIds: string[]; members: Person[] };
export type Project = {
  id: string;
  name: string;
  dept: string;
  published: boolean;
  pct: number;
  chapters: Chapter[];
  groups: Group[];
  workers: Person[];
  tasks: PipeTask[];
};

function httpUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol === "http:" || u.protocol === "https:") return u.href;
  } catch {
    /* ignore */
  }
  return "";
}

export function PipeTaskPopup({
  me,
  manager,
  people,
  project,
  task,
  variant = "modal",
  onClose,
  onAct,
  onUploaded,
}: {
  me: string;
  manager: boolean;
  people: Person[];
  project: Project;
  task: PipeTask;
  variant?: "modal" | "page";
  onClose: () => void;
  onAct: (body: Record<string, unknown>) => Promise<{ id?: string } | null>;
  onUploaded: () => void;
}) {
  const statuses = manager ? PIPE_MANAGER_STATUSES : PIPE_WORKER_STATUSES;
  const statusValue = pipeLiveStatus(task.status);
  const start = task.startsAt ? ymd(new Date(task.startsAt)) : "";
  const end = task.dueAt ? ymd(new Date(task.dueAt)) : "";
  const viewClass = manager ? "view_manager" : "view_worker";
  const isPage = variant === "page";
  const crewKey = task.assigneeIds.join(",");
  const [crewIds, setCrewIds] = useState(task.assigneeIds);
  useEffect(() => {
    setCrewIds(task.assigneeIds);
  }, [crewKey, task.assigneeIds]);

  async function pasteLink() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) await onAct({ action: "updateTask", taskId: task.id, projectUrl: text });
    } catch {
      const text = window.prompt("Ссылка на проект", task.projectUrl || "");
      if (text != null) await onAct({ action: "updateTask", taskId: task.id, projectUrl: text });
    }
  }

  async function copyLink() {
    if (!task.projectUrl) return;
    try {
      await navigator.clipboard.writeText(task.projectUrl);
    } catch {
      window.prompt("Ссылка", task.projectUrl);
    }
  }

  async function openProject() {
    if (!task.projectUrl) return;
    await copyLink();
    const href = httpUrl(task.projectUrl);
    if (href) window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className={`pipe-popup-mask${isPage ? " is-page" : ""}`} onClick={isPage ? undefined : onClose}>
      <div className={`pipe-popup ${viewClass}${isPage ? " is-page" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="pipe-popup-top">
          {manager ? (
            <input
              className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 font-serif text-2xl text-navy"
              defaultValue={task.title}
              onBlur={(e) => {
                const title = e.target.value.trim();
                if (title && title !== task.title) void onAct({ action: "updateTask", taskId: task.id, title });
              }}
            />
          ) : (
            <h3 className="font-serif text-2xl text-navy">{task.title || "Задача"}</h3>
          )}
          <select
            className={`pipe-status ${statusValue}`}
            value={statusValue}
            onChange={(e) => void onAct({ action: "updateTask", taskId: task.id, status: e.target.value })}
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {PIPE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button type="button" className="pipe-ico-exit" onClick={onClose} aria-label={isPage ? "Назад" : "Закрыть"}>
            ×
          </button>
        </div>

        <p className="pipe-crumb mt-2">
          {project.name}
          {" — "}
          {project.groups.find((g) => g.id === task.groupId)?.name || "Группа"}
          {" — "}
          {project.chapters.find((c) => c.id === task.chapterId)?.name || "Этап"}
        </p>

        {manager ? (
          <div className="mt-3 space-y-3">
            <div className="text-sm">
              Исполнитель
              <div className="pipe-crew">
                {people.map((p) => {
                  const on = crewIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`pipe-crew-chip${on ? " is-on" : ""}`}
                      onClick={() => {
                        const prev = crewIds;
                        const next = on ? crewIds.filter((id) => id !== p.id) : [...crewIds, p.id];
                        setCrewIds(next);
                        void onAct({ action: "updateTask", taskId: task.id, assigneeIds: next }).then((saved) => {
                          if (!saved) setCrewIds(prev);
                        });
                      }}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="text-sm">
                Дедлайн
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="rounded-xl border border-line px-3 py-2"
                    defaultValue={start}
                    onBlur={(e) => void onAct({ action: "updateTask", taskId: task.id, startsAt: e.target.value || null })}
                  />
                  <input
                    type="date"
                    className="rounded-xl border border-line px-3 py-2"
                    defaultValue={end}
                    onBlur={(e) => void onAct({ action: "updateTask", taskId: task.id, dueAt: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="text-sm">
                Ссылка на проект
                {task.projectUrl ? (
                  <div className="mt-1 flex flex-wrap gap-2">
                    <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold" onClick={() => void copyLink()}>
                      {task.projectUrl}
                    </button>
                    <button type="button" className="rounded-xl border border-gold px-3 py-2 text-sm font-semibold" onClick={() => void pasteLink()}>
                      ✎
                    </button>
                  </div>
                ) : (
                  <button type="button" className="mt-1 rounded-xl border border-dashed border-gold px-3 py-2 text-sm font-semibold" onClick={() => void pasteLink()}>
                    + Ссылка на проект
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-muted">
              {task.assigneeNames.join(", ") || "Без исполнителя"}
              {start || end ? ` · ${start || "…"} — ${end || "…"}` : ""}
            </p>
            <div className="text-sm">
              Ссылка на проект
              {task.projectUrl ? (
                <div className="mt-1 flex flex-wrap gap-2">
                  <button type="button" className="rounded-xl border border-gold bg-white px-3 py-2 text-sm font-semibold" onClick={() => void openProject()}>
                    Открыть проект
                  </button>
                  <button type="button" className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-semibold" onClick={() => void copyLink()}>
                    Копировать
                  </button>
                </div>
              ) : (
                <p className="mt-1 text-sm text-muted">Ссылки пока нет</p>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <p className="text-sm text-muted">Описание задачи</p>
          {manager ? (
            <textarea
              className="mt-2 min-h-20 w-full rounded-xl border border-line px-3 py-2"
              defaultValue={task.brief}
              onBlur={(e) => {
                if (e.target.value !== task.brief) void onAct({ action: "updateTask", taskId: task.id, brief: e.target.value });
              }}
            />
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-[15px]">{task.brief || "Описание ещё не добавлено."}</p>
          )}
        </div>

        <div className="pipe-media mt-4">
          {task.files.map((f) => (
            <a key={f.id} href={`/api/prod/files/${f.id}`} className="add" target="_blank" rel="noreferrer">
              {f.name}
            </a>
          ))}
          <label>
            + Приложить медиа
            <input
              type="file"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                const body = new FormData();
                body.set("file", file);
                body.set("kind", "ref");
                const res = await fetch(`/api/prod/tasks/${task.id}/files`, { method: "POST", body });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  window.alert(data.error || "Не загрузилось");
                  return;
                }
                onUploaded();
              }}
            />
          </label>
        </div>

        {manager ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Этап
              <select
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                value={task.chapterId || ""}
                onChange={(e) => void onAct({ action: "updateTask", taskId: task.id, chapterId: e.target.value || null, groupId: null })}
              >
                {project.chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Группа
              <select
                className="mt-1 w-full rounded-xl border border-line px-3 py-2"
                value={task.groupId || ""}
                onChange={(e) => void onAct({ action: "updateTask", taskId: task.id, groupId: e.target.value || null })}
              >
                <option value="">не выбрана</option>
                {project.groups
                  .filter((g) => !task.chapterId || g.chapterId === task.chapterId)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ) : null}

        {manager ? (
          <button
            type="button"
            className="mt-3 text-sm text-bad"
            onClick={() => {
              if (window.confirm("Удалить задачу?")) {
                void onAct({ action: "deleteTask", taskId: task.id }).then(() => onClose());
              }
            }}
          >
            Удалить задачу
          </button>
        ) : null}

        <div className="pipe-chatbox descriptionforeditor">
          <p className="mb-2 font-serif text-lg text-navy">Чат задачи</p>
          <TeamChat endpoint={`/api/prod/tasks/${task.id}/chat`} canWrite me={me} className="h-[36vh]" />
        </div>
      </div>
    </div>
  );
}

export function PipeTaskSheet({
  me,
  manager,
  people,
  project,
  task,
}: {
  me: string;
  manager: boolean;
  people: Person[];
  project: Project;
  task: PipeTask;
}) {
  const router = useRouter();

  async function act(body: Record<string, unknown>) {
    const res = await fetch("/api/prod/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.error || "Не удалось сохранить");
      return null;
    }
    router.refresh();
    return data;
  }

  return (
    <PipeTaskPopup
      key={`${task.id}-${task.status}-${task.chapterId || ""}-${task.groupId || ""}-${task.projectUrl}-${task.files.length}-${task.brief.length}`}
      me={me}
      manager={manager}
      people={people}
      project={project}
      task={task}
      variant="page"
      onClose={() => router.push("/prod")}
      onAct={act}
      onUploaded={() => router.refresh()}
    />
  );
}

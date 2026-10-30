"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PIPE_DAY_PX,
  PIPE_DEPT_LABEL,
  PIPE_STATUS_LABEL,
  parseDay,
  pipeLiveStatus,
  sortPipeTasks,
  weekdaysBetween,
  ymd,
  type PipeDept,
} from "@/lib/pipe-board";
import { PipeTaskPopup, type Person, type PipeTask, type Project } from "./PipeTaskPopup";
import "./pipeline-desk.css";

function taskPeople(t: PipeTask) {
  return t.assigneeIds.length ? t.assigneeIds : t.assigneeId ? [t.assigneeId] : [];
}

function taskRange(t: PipeTask) {
  const a = t.startsAt ? ymd(new Date(t.startsAt)) : "";
  const b = t.dueAt ? ymd(new Date(t.dueAt)) : "";
  if (!a && !b) return "";
  return `${a || "…"} — ${b || "…"}`;
}

function TaskCard({ task, onOpen }: { task: PipeTask; onOpen: (id: string) => void }) {
  const st = pipeLiveStatus(task.status);
  return (
    <button type="button" className={`pipe-taskcard ${st}`} onClick={() => onOpen(task.id)}>
      <div className="pipe-taskcard-top">
        <strong>{task.title || "Задача"}</strong>
        <span className={`pipe-status ${st}`}>{PIPE_STATUS_LABEL[st] || st}</span>
      </div>
      <p className="pipe-taskcard-brief">{task.brief || "Краткое описание задачи"}</p>
      <p className="pipe-taskcard-meta">{task.assigneeNames.join(", ") || "Исполнитель"}</p>
      <p className="pipe-taskcard-meta">{taskRange(task) || "Дедлайн (в формате даты)"}</p>
    </button>
  );
}

export function PipelineDesk({
  initialDept,
  depts,
  manager,
  me,
  people,
  projects,
}: {
  initialDept: PipeDept;
  depts: PipeDept[];
  manager: boolean;
  me: string;
  people: Person[];
  projects: Project[];
}) {
  const router = useRouter();
  const [dept, setDept] = useState<PipeDept>(initialDept);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [chOpen, setChOpen] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<Record<string, boolean>>({});
  const [taskId, setTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch("/api/prod/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      window.alert(data.error || "Не удалось сохранить");
      return null;
    }
    router.refresh();
    return data;
  }

  function goDept(next: PipeDept) {
    setDept(next);
    router.replace(`/prod/pipeline?dept=${next}`);
  }

  const taskMap = useMemo(() => {
    const m = new Map<string, { project: Project; task: PipeTask }>();
    for (const p of projects) for (const t of p.tasks) m.set(t.id, { project: p, task: t });
    return m;
  }, [projects]);
  const opened = taskId ? taskMap.get(taskId) : null;

  return (
    <div className="pipe-desk">
      <div className="pipe-dept-bar">
        {depts.map((d) => (
          <button
            key={d}
            type="button"
            className={`pipe-choose-departament${d === dept ? " is-on" : ""}`}
            onClick={() => goDept(d)}
          >
            {PIPE_DEPT_LABEL[d]}
          </button>
        ))}
      </div>

      {projects.map((project) => {
        const drafting = manager && !project.published;
        const editing = Boolean(edit[project.id] || drafting);
        const collapsed = open[project.id] === false && project.published && !editing;
        return (
          <section
            key={project.id}
            className={`pipe-project${drafting ? " is-draft" : ""}${collapsed ? " is-inactive" : " is-active"}`}
          >
            <div className="pipe-head">
              <button
                type="button"
                className="pipe-header"
                onClick={() => setOpen((s) => ({ ...s, [project.id]: s[project.id] === false }))}
              >
                {editing ? (
                  <input
                    className="rounded-xl border border-line bg-white px-3 py-1.5 font-serif text-xl text-navy"
                    defaultValue={project.name}
                    disabled={busy}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const name = e.target.value.trim();
                      if (name && name !== project.name) void act({ action: "renameProject", projectId: project.id, name });
                    }}
                  />
                ) : (
                  <h2 className="font-serif text-2xl text-navy">{project.name}</h2>
                )}
                <span className="pipe-pct">{project.pct}%</span>
              </button>
              {manager ? (
                <div className="pipe-tools">
                  {project.published ? (
                    <button
                      type="button"
                      title={editing ? "Готово" : "Изменить"}
                      aria-label={editing ? "Готово" : "Изменить"}
                      onClick={() => setEdit((s) => ({ ...s, [project.id]: !s[project.id] }))}
                    >
                      {editing ? "✓" : "✎"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pipe-ico-approve"
                      title="Утвердить"
                      aria-label="Утвердить"
                      disabled={busy}
                      onClick={() => void act({ action: "publishProject", projectId: project.id })}
                    >
                      ✓
                    </button>
                  )}
                  {editing ? (
                    <button
                      type="button"
                      className="text-bad"
                      title="Удалить проект"
                      aria-label="Удалить проект"
                      onClick={() => {
                        if (window.confirm("Удалить проект?")) void act({ action: "deleteProject", projectId: project.id });
                      }}
                    >
                      ⌫
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {collapsed ? null : (
              <>
                <div className="pipe-chapter-stack">
                    {project.chapters.map((ch) => {
                      const groups = project.groups.filter((g) => g.chapterId === ch.id);
                      const loose = sortPipeTasks(
                        project.tasks.filter((t) => t.chapterId === ch.id && !t.groupId),
                        manager,
                      );
                      const active = chOpen[ch.id] !== false;
                      return (
                        <article
                          key={ch.id}
                          className={`pipe-chapter${manager ? " is-manager" : ""}${active ? " is-active" : " is-inactive"}`}
                        >
                          <div className="pipe-header" onClick={() => setChOpen((s) => ({ ...s, [ch.id]: s[ch.id] === false }))}>
                            {editing ? (
                              <input
                                className="rounded-lg border border-line bg-white px-2 py-1 font-semibold"
                                defaultValue={ch.name}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const name = e.target.value.trim();
                                  if (name && name !== ch.name) void act({ action: "renameChapter", chapterId: ch.id, name });
                                }}
                              />
                            ) : (
                              <strong>{ch.name}</strong>
                            )}
                            <span className="pipe-pct">{ch.pct}%</span>
                            <span className="text-muted">{active ? "⌃" : "⌄"}</span>
                            {editing ? (
                              <button
                                type="button"
                                className="ml-auto text-sm text-bad"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void act({ action: "deleteChapter", chapterId: ch.id });
                                }}
                              >
                                Удалить этап
                              </button>
                            ) : null}
                          </div>
                          {active ? (
                            <div className="mt-2 space-y-4">
                              {groups.map((g) => {
                                const tasks = sortPipeTasks(
                                  project.tasks.filter((t) => t.groupId === g.id),
                                  manager,
                                );
                                return (
                                  <div key={g.id} className="pipe-task-group">
                                    <div className="mb-1 flex items-center gap-2">
                                      {editing ? (
                                        <input
                                          className="rounded-md border border-line bg-white px-2 py-0.5 text-sm font-semibold"
                                          defaultValue={g.name}
                                          onBlur={(e) => {
                                            const name = e.target.value.trim();
                                            if (name && name !== g.name) void act({ action: "renameGroup", groupId: g.id, name });
                                          }}
                                        />
                                      ) : (
                                        <span className="text-sm font-semibold text-navy">{g.name}</span>
                                      )}
                                      {editing ? (
                                        <button
                                          type="button"
                                          className="text-xs text-bad"
                                          onClick={() => void act({ action: "deleteGroup", groupId: g.id })}
                                        >
                                          Удалить
                                        </button>
                                      ) : null}
                                    </div>
                                    <div className="pipe-task-grid">
                                      {tasks.map((t) => (
                                        <TaskCard key={t.id} task={t} onOpen={setTaskId} />
                                      ))}
                                      {editing ? (
                                        <button
                                          type="button"
                                          className="pipe-add-taskcard"
                                          onClick={async () => {
                                            const data = await act({
                                              action: "createTask",
                                              projectId: project.id,
                                              chapterId: ch.id,
                                              groupId: g.id,
                                              title: "Новая задача",
                                            });
                                            if (data?.id) setTaskId(String(data.id));
                                          }}
                                        >
                                          + Добавить задачу
                                        </button>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                              {loose.length ? (
                                <div className="pipe-task-group">
                                  <span className="mb-1 block text-xs text-muted">Без группы</span>
                                  <div className="pipe-task-grid">
                                    {loose.map((t) => (
                                      <TaskCard key={t.id} task={t} onOpen={setTaskId} />
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                              {editing ? (
                                <button
                                  type="button"
                                  className="pipe-add-tasklink"
                                  onClick={() => {
                                    const name = window.prompt("Название группы задач");
                                    if (name) void act({ action: "createGroup", projectId: project.id, chapterId: ch.id, name });
                                  }}
                                >
                                  + группа
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                    {editing ? (
                      <button
                        type="button"
                        className="pipe-add-chapter"
                        onClick={() => {
                          const name = window.prompt("Название этапа");
                          if (name) void act({ action: "createChapter", projectId: project.id, name });
                        }}
                      >
                        + Добавить раздел
                      </button>
                    ) : null}
                </div>
                <GanttGrid project={project} people={people} manager={manager} onOpen={setTaskId} onAct={act} />
              </>
            )}
          </section>
        );
      })}

      {manager ? (
        <button
          type="button"
          className="pipe-project-add"
          disabled={busy}
          onClick={async () => {
            const data = await act({ action: "createProject", dept, name: "Новый проект" });
            if (data?.id) setEdit((s) => ({ ...s, [String(data.id)]: true }));
          }}
        >
          + Добавить проект
        </button>
      ) : null}

      {opened ? (
        <PipeTaskPopup
          key={`${opened.task.id}-${opened.task.status}-${opened.task.chapterId || ""}-${opened.task.groupId || ""}-${opened.task.projectUrl}-${opened.task.files.length}-${opened.task.brief.length}`}
          me={me}
          manager={manager}
          people={people}
          project={opened.project}
          task={opened.task}
          onClose={() => setTaskId(null)}
          onAct={act}
          onUploaded={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}

function GanttGrid({
  project,
  people,
  manager,
  onOpen,
  onAct,
}: {
  project: Project;
  people: Person[];
  manager: boolean;
  onOpen: (id: string) => void;
  onAct: (body: Record<string, unknown>) => Promise<{ id?: string } | null>;
}) {
  const [filter, setFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const dated = project.tasks.filter((t) => t.startsAt && t.dueAt);
  const today = new Date();
  const from = dated.reduce((a, t) => {
    const d = new Date(t.startsAt as string);
    return d < a ? d : a;
  }, new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const to = dated.reduce((a, t) => {
    const d = new Date(t.dueAt as string);
    return d > a ? d : a;
  }, new Date(today.getFullYear(), today.getMonth(), today.getDate() + 14));
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  let days = weekdaysBetween(start, end);
  if (!days.length) {
    const pad = new Date(end);
    pad.setDate(pad.getDate() + 10);
    days = weekdaysBetween(start, pad);
  }
  const col = PIPE_DAY_PX;
  const chapterGroups = filter ? project.groups.filter((g) => g.chapterId === filter) : project.groups;
  const visible = project.tasks.filter((t) => {
    if (filter && t.chapterId !== filter) return false;
    if (groupFilter && t.groupId !== groupFilter) return false;
    return true;
  });

  const workerIds = new Set<string>();
  for (const w of project.workers) workerIds.add(w.id);
  for (const t of visible) for (const id of taskPeople(t)) workerIds.add(id);

  type GanttRow = {
    key: string;
    kind: "group" | "person" | "unassigned" | "add" | "create";
    label: string;
    userId?: string;
    groupId?: string;
    tasks: PipeTask[];
  };
  const rows: GanttRow[] = [];
  const groupedIds = new Set(chapterGroups.map((g) => g.id));
  const showGroups = groupFilter ? chapterGroups.filter((g) => g.id === groupFilter) : chapterGroups;

  for (const g of showGroups) {
    const gTasks = visible.filter((t) => t.groupId === g.id);
    const isFolded = folded[g.id] === true;
    rows.push({ key: `g-${g.id}`, kind: "group", label: g.name, groupId: g.id, tasks: [] });
    if (isFolded) continue;
    const ids = new Set<string>();
    for (const t of gTasks) for (const id of taskPeople(t)) ids.add(id);
    for (const p of people.filter((x) => ids.has(x.id))) {
      rows.push({
        key: `g-${g.id}-w-${p.id}`,
        kind: "person",
        label: p.name,
        userId: p.id,
        groupId: g.id,
        tasks: gTasks.filter((t) => taskPeople(t).includes(p.id)),
      });
    }
    const gUnassigned = gTasks.filter((t) => !taskPeople(t).length);
    if (gUnassigned.length) {
      rows.push({ key: `g-${g.id}-none`, kind: "unassigned", label: "Без исполнителя", groupId: g.id, tasks: gUnassigned });
    }
    if (manager) rows.push({ key: `g-${g.id}-add`, kind: "add", label: "+ Добавить", groupId: g.id, tasks: [] });
  }

  const looseTasks = visible.filter((t) => !t.groupId || !groupedIds.has(t.groupId));
  const looseIds = new Set<string>();
  for (const t of looseTasks) for (const id of taskPeople(t)) looseIds.add(id);
  for (const w of project.workers) if (!showGroups.length) looseIds.add(w.id);
  if (!showGroups.length) {
    for (const id of workerIds) looseIds.add(id);
  }
  const shownPeople = new Set(rows.filter((r) => r.userId).map((r) => r.userId));
  for (const p of people.filter((x) => looseIds.has(x.id) && !shownPeople.has(x.id))) {
    rows.push({
      key: `w-${p.id}`,
      kind: "person",
      label: p.name,
      userId: p.id,
      tasks: looseTasks.filter((t) => taskPeople(t).includes(p.id)),
    });
  }
  const looseUnassigned = looseTasks.filter((t) => !taskPeople(t).length);
  if (looseUnassigned.length) {
    rows.push({ key: "unassigned", kind: "unassigned", label: "Без исполнителя", tasks: looseUnassigned });
  }
  if (manager) rows.push({ key: "create-group", kind: "create", label: "+ Создать группу", tasks: [] });

  function barStyle(task: PipeTask) {
    if (!task.startsAt || !task.dueAt || !days.length) return null;
    const a = ymd(new Date(task.startsAt));
    const b = ymd(new Date(task.dueAt));
    let i0 = days.findIndex((d) => d >= a);
    let i1 = -1;
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i] <= b) {
        i1 = i;
        break;
      }
    }
    if (i0 < 0) i0 = 0;
    if (i1 < 0) i1 = days.length - 1;
    if (i1 < i0) return null;
    return { left: i0 * col + 4, width: Math.max(col - 8, (i1 - i0 + 1) * col - 8) };
  }

  async function addOnRow(row: { userId?: string; groupId?: string }) {
    const group = row.groupId
      ? project.groups.find((g) => g.id === row.groupId)
      : groupFilter
        ? project.groups.find((g) => g.id === groupFilter)
        : null;
    const chapterId = group?.chapterId || filter || project.chapters[0]?.id;
    if (!chapterId) {
      window.alert("Сначала создайте этап");
      return;
    }
    const data = await onAct({
      action: "createTask",
      projectId: project.id,
      chapterId,
      assigneeId: row.userId || null,
      assigneeIds: row.userId ? [row.userId] : [],
      groupId: row.groupId || groupFilter || null,
      startsAt: days[0],
      dueAt: days[Math.min(4, Math.max(0, days.length - 1))],
      title: "Новая задача",
    });
    if (data?.id) onOpen(String(data.id));
  }

  return (
    <div className="pipe-gantt">
      <div className="pipe-gantt-title">Пайплайн</div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <label className="ml-auto text-sm">
          Этап
          <select
            className="ml-2 rounded-lg border border-line px-2 py-1"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setGroupFilter("");
            }}
          >
            <option value="">Все</option>
            {project.chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {chapterGroups.length ? (
          <label className="text-sm">
            Группа
            <select
              className="ml-2 rounded-lg border border-line px-2 py-1"
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
            >
              <option value="">Все</option>
              {chapterGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {manager ? (
          <>
            <button
              type="button"
              className="text-sm font-semibold text-gold"
              onClick={() => {
                const chapterId = filter || project.chapters[0]?.id;
                if (!chapterId) {
                  window.alert("Сначала создайте этап");
                  return;
                }
                const fromChapter = project.chapters.find((c) => c.id === chapterId);
                const name = window.prompt("Имя группы задач", fromChapter?.name || "");
                if (name) void onAct({ action: "createGroup", projectId: project.id, chapterId, name });
              }}
            >
              + группа
            </button>
            <label className="text-sm">
              Сотрудник
              <select
                className="ml-2 rounded-lg border border-line px-2 py-1"
                defaultValue=""
                onChange={(e) => {
                  const userId = e.target.value;
                  e.currentTarget.value = "";
                  if (userId) void onAct({ action: "attachWorker", projectId: project.id, userId });
                }}
              >
                <option value="">Добавить…</option>
                {people
                  .filter((p) => !workerIds.has(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
      <div className="pipe-horizontal-scroll">
        <table className="pipe-gantt-table">
          <thead>
            <tr>
              <th className="pipe-header-corner">Исполнитель</th>
              {days.map((d) => (
                <th key={d} style={{ width: col, minWidth: col }}>
                  {parseDay(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}
                </th>
              ))}
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {rows.flatMap((row) => {
              if (row.kind === "create") {
                return [
                  <tr key={row.key}>
                    <td className="pipe-header-corner" colSpan={days.length + 2} style={{ padding: 0 }}>
                      <button
                        type="button"
                        className="pipe-gantt-create"
                        onClick={() => {
                          const chapterId = filter || project.chapters[0]?.id;
                          if (!chapterId) {
                            window.alert("Сначала создайте этап");
                            return;
                          }
                          const fromChapter = project.chapters.find((c) => c.id === chapterId);
                          const name = window.prompt("Имя группы задач", fromChapter?.name || "");
                          if (name) void onAct({ action: "createGroup", projectId: project.id, chapterId, name });
                        }}
                      >
                        + Создать группу
                      </button>
                    </td>
                  </tr>,
                ];
              }
              if (row.kind === "add") {
                return [
                  <tr key={row.key}>
                    <td className="pipe-header-corner">
                      <select
                        className="pipe-gantt-add w-full bg-transparent"
                        defaultValue=""
                        onChange={(e) => {
                          const userId = e.target.value;
                          e.currentTarget.value = "";
                          if (userId) void onAct({ action: "attachWorker", projectId: project.id, userId });
                        }}
                      >
                        <option value="">+ Добавить</option>
                        {people
                          .filter((p) => !workerIds.has(p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td colSpan={Math.max(1, days.length)} />
                    <td />
                  </tr>,
                ];
              }
              if (row.kind === "group") {
                const openGroup = folded[row.groupId || ""] !== true;
                return [
                  <tr key={row.key}>
                    <td className="pipe-header-corner">
                      <button
                        type="button"
                        className="pipe-gantt-group"
                        onClick={() => setFolded((s) => ({ ...s, [row.groupId!]: s[row.groupId!] !== true }))}
                      >
                        {row.label} {openGroup ? "⌃" : "⌄"}
                      </button>
                    </td>
                    <td colSpan={Math.max(1, days.length)} />
                    <td />
                  </tr>,
                ];
              }
              const strips = row.tasks.filter((t) => barStyle(t));
              const lanes = strips.length ? strips : [null];
              return lanes.map((task, i) => (
                <tr key={`${row.key}-${task?.id || "empty"}`} className="pipe-taskline">
                  {i === 0 ? (
                    <td className="pipe-header-corner" rowSpan={lanes.length}>
                      <div className="flex items-center gap-2">
                        <span>{row.label}</span>
                        {manager && row.userId ? (
                          <button
                            type="button"
                            className="text-xs text-muted"
                            onClick={() => void onAct({ action: "detachWorker", projectId: project.id, userId: row.userId })}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                  <td colSpan={Math.max(1, days.length)} style={{ padding: 0 }}>
                    <div className="pipe-gantt-lane" style={{ width: Math.max(col, days.length * col) }}>
                      {task
                        ? (() => {
                            const st = barStyle(task);
                            if (!st) return null;
                            return (
                              <button
                                type="button"
                                className={`pipe-taskbar ${task.status}`}
                                style={{ left: st.left, width: st.width }}
                                onClick={() => onOpen(task.id)}
                              >
                                {task.title}
                              </button>
                            );
                          })()
                        : null}
                    </div>
                  </td>
                  {i === 0 ? (
                    <td rowSpan={lanes.length}>
                      {manager && row.kind === "person" ? (
                        <button type="button" className="pipe-addtask" onClick={() => void addOnRow(row)}>
                          +
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

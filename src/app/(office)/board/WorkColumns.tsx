"use client";

import { useRef, useState } from "react";
import { BOARD_STATUSES, type BoardStatus } from "@/lib/work-board-graph";
import type { BoardEdge, BoardPerson, BoardTask } from "./types";

export function WorkColumns({
  mode,
  tasks,
  edges,
  people,
  onMove,
}: {
  mode: "status" | "people";
  tasks: BoardTask[];
  edges: BoardEdge[];
  people: BoardPerson[];
  onMove: (task: BoardTask, patch: { status?: BoardStatus; assigneeId?: string | null }) => void;
}) {
  const dragId = useRef("");
  const [over, setOver] = useState("");
  const step = new Map(tasks.map((task, index) => [task.id, index + 1]));
  const columns =
    mode === "status"
      ? BOARD_STATUSES.map((status) => ({
          id: status.id,
          title: status.label,
          hint: tasks.filter((task) => task.status === status.id).length + " шт.",
          locked: false,
        }))
      : peopleColumns(tasks, people);

  function cardsIn(id: string) {
    return tasks.filter((task) => (mode === "status" ? task.status === id : (task.assigneeId ?? "") === id));
  }

  return (
    <div className="wb-columns">
      {columns.map((column) => (
        <section
          key={column.id || "none"}
          className={over === column.id ? "wb-column is-over" : "wb-column"}
          onDragOver={(event) => {
            if (column.locked) return;
            event.preventDefault();
            setOver(column.id);
          }}
          onDragLeave={() => setOver((current) => (current === column.id ? "" : current))}
          onDrop={(event) => {
            event.preventDefault();
            setOver("");
            const task = tasks.find((item) => item.id === dragId.current);
            dragId.current = "";
            if (!task || column.locked) return;
            if (mode === "status") {
              if (task.status !== column.id) onMove(task, { status: column.id as BoardStatus });
              return;
            }
            const next = column.id || null;
            if (task.assigneeId !== next) onMove(task, { assigneeId: next });
          }}
        >
          <header>
            <strong>{column.title}</strong>
            <span>{column.hint}</span>
          </header>
          <div className="wb-column-body">
            {cardsIn(column.id).map((task) => (
              <article
                key={task.id}
                className="wb-mini"
                draggable={!column.locked}
                onDragStart={() => {
                  dragId.current = task.id;
                }}
              >
                <header>
                  <span className="wb-step">шаг {step.get(task.id)} · </span>
                  {task.title}
                </header>
                <div>
                  <p>{task.body || "Без описания"}</p>
                  <p>{mode === "status" ? task.assigneeName || "Не назначен" : statusLabel(task.status)}</p>
                  <p>{linkHint(task.id, tasks, edges)}</p>
                </div>
              </article>
            ))}
            {cardsIn(column.id).length === 0 ? <p className="wb-empty">Пока пусто</p> : null}
          </div>
        </section>
      ))}
    </div>
  );
}

function statusLabel(status: BoardStatus) {
  return BOARD_STATUSES.find((item) => item.id === status)?.label ?? status;
}

function peopleColumns(tasks: BoardTask[], people: BoardPerson[]) {
  const columns = [
    { id: "", title: "Не назначено", hint: "", locked: false },
    ...people.map((person) => ({
      id: person.id,
      title: person.name,
      hint: person.position,
      locked: false,
    })),
  ];
  for (const task of tasks) {
    if (task.assigneeId && !columns.some((column) => column.id === task.assigneeId)) {
      columns.push({
        id: task.assigneeId,
        title: task.assigneeName || "Бывший сотрудник",
        hint: "не в штате",
        locked: true,
      });
    }
  }
  return columns.map((column) => ({
    ...column,
    hint:
      column.hint ||
      tasks.filter((task) => (task.assigneeId ?? "") === column.id).length + " шт.",
  }));
}

function linkHint(id: string, tasks: BoardTask[], edges: BoardEdge[]) {
  const names = new Map(tasks.map((task) => [task.id, task.title]));
  const before = edges.filter((edge) => edge.toId === id).map((edge) => names.get(edge.fromId)).filter(Boolean);
  if (!before.length) return "Никого не ждёт";
  return "Ждёт: " + before.join(", ");
}

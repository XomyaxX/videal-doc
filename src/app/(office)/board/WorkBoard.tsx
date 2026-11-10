"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  BOARD_EDGE_KINDS,
  BOARD_STATUSES,
  areaFrame,
  edgeLabel,
  edgeWouldCycle,
  hasSameLink,
  isOverdue,
  normalizeLink,
  studioToday,
  type BoardEdgeKind,
  type BoardStatus,
} from "@/lib/work-board-graph";
import { WorkColumns } from "./WorkColumns";
import type { BoardPerson, BoardSnapshot, BoardTask } from "./types";
import "./work-board.css";

type TaskData = {
  title: string;
  body: string;
  status: BoardStatus;
  assigneeId: string | null;
  assigneeName: string;
  departmentId: string | null;
  dueOn: string;
  prodTaskId: string | null;
  prodTaskTitle: string;
  version: number;
};

type AreaData = { title: string; count: number; deptKey: string };
type TaskFlowNode = Node<TaskData, "task">;
type AreaFlowNode = Node<AreaData, "area">;
type FlowNode = TaskFlowNode | AreaFlowNode;

type BoardApi = {
  people: BoardPerson[];
  patch: (id: string, version: number, body: Record<string, unknown>) => void;
  remove: (id: string) => void;
};

const BoardApiContext = createContext<BoardApi>({
  people: [],
  patch: () => {},
  remove: () => {},
});

const nodeTypes = { task: TaskCard, area: AreaNode };

const EDGE_COLOR: Record<BoardEdgeKind, string> = {
  blocks: "#ffb4a2",
  depends: "#f5c542",
  sequence: "#b7e4c7",
};

export function WorkBoard({ initial, people }: { initial: BoardSnapshot; people: BoardPerson[] }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [view, setView] = useState<"canvas" | "status" | "people">("canvas");
  const [focus, setFocus] = useState<string | null>(null);
  const [kind, setKind] = useState<BoardEdgeKind>("depends");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const dragging = useRef(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(buildBoardNodes(visibleTasks(initial.tasks, null)));
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(toFlowEdges(initial.edges));
  const [seenAt, setSeenAt] = useState(initial.updatedAt);
  const [seenFocus, setSeenFocus] = useState<string | null>(null);
  const shown = visibleTasks(snapshot.tasks, focus);
  if (snapshot.updatedAt !== seenAt || focus !== seenFocus) {
    setSeenAt(snapshot.updatedAt);
    setSeenFocus(focus);
    setNodes(buildBoardNodes(shown));
    setFlowEdges(toFlowEdges(visibleEdges(snapshot.edges, shown)));
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (dragging.current) return;
      void fetch("/api/board")
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { snapshot?: BoardSnapshot } | null) => {
          if (!data?.snapshot || dragging.current) return;
          setSnapshot((prev) => (prev.updatedAt === data.snapshot?.updatedAt ? prev : data.snapshot!));
        })
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const send = useCallback(async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; snapshot?: BoardSnapshot | null };
    if (data.snapshot) setSnapshot(data.snapshot);
    if (!res.ok) {
      setNotice(data.error || "Не получилось сохранить");
      if (!data.snapshot) {
        const again = await fetch("/api/board").then((item) => (item.ok ? item.json() : null)).catch(() => null);
        if (again?.snapshot) setSnapshot(again.snapshot);
      }
      return false;
    }
    return true;
  }, []);

  const api = useMemo<BoardApi>(
    () => ({
      people,
      patch: (id, version, body) => {
        void send(`/api/board/tasks/${id}`, "PATCH", { version, ...body });
      },
      remove: (id) => {
        if (!window.confirm("Удалить задачу? Связи с ней тоже пропадут.")) return;
        void send(`/api/board/tasks/${id}`, "DELETE");
      },
    }),
    [people, send],
  );

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      const source = connection.source;
      const target = connection.target;
      if (!source || !target) return false;
      const link = normalizeLink(kind, source, target);
      if (hasSameLink(snapshot.edges, link.fromId, link.toId)) return false;
      return !edgeWouldCycle(snapshot.edges, link.fromId, link.toId);
    },
    [kind, snapshot.edges],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const link = normalizeLink(kind, connection.source, connection.target);
      if (hasSameLink(snapshot.edges, link.fromId, link.toId)) {
        setNotice("Такая связь уже есть");
        return;
      }
      if (edgeWouldCycle(snapshot.edges, link.fromId, link.toId)) {
        setNotice("Такая связь замкнёт цикл");
        return;
      }
      void send("/api/board/edges", "POST", {
        sourceId: connection.source,
        targetId: connection.target,
        kind,
      });
    },
    [kind, send, snapshot.edges],
  );

  const kindMeta = BOARD_EDGE_KINDS.find((item) => item.id === kind) ?? BOARD_EDGE_KINDS[1];

  return (
    <BoardApiContext.Provider value={api}>
      <div className="wb-page">
        <header className="wb-bar">
          <div>
            <p className="wb-kicker">Закрытый тест · одна доска студии</p>
            <h1>Доска задач</h1>
            <p className="wb-crumb">
              <button type="button" onClick={() => setFocus(null)} aria-current={focus ? undefined : "page"}>
                Вся студия
              </button>
              {focus ? <span>{focusLabel(snapshot.tasks, focus)}</span> : null}
            </p>
          </div>
          <div className="wb-actions">
            <div className="wb-switch" role="tablist" aria-label="Вид доски">
              {(
                [
                  ["canvas", "Схема"],
                  ["status", "Статусы"],
                  ["people", "Люди"],
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}>
                  {label}
                </button>
              ))}
            </div>
            {view === "canvas" ? (
              <select
                className="wb-select"
                aria-label="Тип связи"
                value={kind}
                onChange={(event) => setKind(event.target.value as BoardEdgeKind)}
              >
                {BOARD_EDGE_KINDS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="wb-add"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void send("/api/board/tasks", "POST", {
                  title: "Новая задача",
                  departmentId: focus && focus !== NONE_DEPT ? focus : null,
                }).finally(() => setBusy(false));
              }}
            >
              Новая задача
            </button>
          </div>
        </header>
        <div className="wb-depts" aria-label="Отделы">
          {departmentChips(snapshot.tasks).map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={focus === chip.key}
              onClick={() => setFocus(chip.key)}
            >
              {chip.title}
              <span>{chip.count}</span>
            </button>
          ))}
        </div>
        <p className="wb-hint">
          {view === "canvas"
            ? `${focus ? "Открыт один отдел. «Вся студия» возвращает к общей схеме. " : "Нажмите жёлтый ярлык отдела, чтобы провалиться внутрь. "}${kindMeta.hint}`
            : "Перетащите карточку в другую колонку. Просроченный срок подсвечен."}
        </p>
        {notice ? (
          <p className="wb-notice" role="status">
            {notice}
          </p>
        ) : null}
        <div className="wb-stage">
          {view === "canvas" && mounted ? (
            <div className="wb-flow">
              <ReactFlow
                nodes={nodes}
                edges={flowEdges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                nodeTypes={nodeTypes}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onNodeClick={(_, node) => {
                  if (node.type === "area" && !focus) setFocus(String((node.data as AreaData).deptKey));
                }}
                onNodeDragStart={() => {
                  dragging.current = true;
                }}
                onNodeDragStop={(_, node) => {
                  const task = snapshot.tasks.find((item) => item.id === node.id);
                  const same =
                    task &&
                    Math.abs(task.posX - node.position.x) < 0.5 &&
                    Math.abs(task.posY - node.position.y) < 0.5;
                  if (!task || same) {
                    dragging.current = false;
                    return;
                  }
                  void send(`/api/board/tasks/${node.id}`, "PATCH", {
                    version: task.version,
                    posX: node.position.x,
                    posY: node.position.y,
                  }).finally(() => {
                    dragging.current = false;
                  });
                }}
                onEdgesDelete={(deleted) => {
                  for (const edge of deleted) void send(`/api/board/edges/${edge.id}`, "DELETE");
                }}
                fitView
                fitViewOptions={{ padding: 0.18 }}
                minZoom={0.35}
                maxZoom={1.7}
                deleteKeyCode={["Backspace", "Delete"]}
                panOnScroll
                proOptions={{ hideAttribution: false }}
                colorMode="dark"
              >
                <FitFocus focus={focus ?? "studio"} />
                <Background variant={BackgroundVariant.Lines} gap={28} color="rgba(245, 197, 66, 0.14)" />
                <MiniMap
                  pannable
                  zoomable
                  maskColor="rgba(0,0,0,0.55)"
                  bgColor="#1b1712"
                  nodeColor={(node) => {
                    const status = (node.data as TaskData | undefined)?.status;
                    if (status === "done") return "#7dcea0";
                    if (status === "wip") return "#f5c542";
                    return "#f7e7a1";
                  }}
                />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          ) : null}
          {view !== "canvas" ? (
            <WorkColumns
              mode={view}
              tasks={shown}
              edges={visibleEdges(snapshot.edges, shown)}
              people={people}
              onMove={(task, patch) => {
                void send(`/api/board/tasks/${task.id}`, "PATCH", { version: task.version, ...patch });
              }}
            />
          ) : null}
        </div>
      </div>
    </BoardApiContext.Provider>
  );
}

function TaskCard({ id, data, selected }: NodeProps<TaskFlowNode>) {
  const api = useContext(BoardApiContext);
  const [title, setTitle] = useState(data.title);
  const [body, setBody] = useState(data.body);
  const [seen, setSeen] = useState({ title: data.title, body: data.body, version: data.version });
  if (seen.title !== data.title || seen.body !== data.body || seen.version !== data.version) {
    const active = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    setSeen({ title: data.title, body: data.body, version: data.version });
    if (active?.dataset.wb !== id) {
      setTitle(data.title);
      setBody(data.body);
    }
  }

  const late = isOverdue(data.dueOn, data.status, studioToday());
  return (
    <article className={selected ? "wb-card is-selected" : late ? "wb-card is-overdue" : "wb-card"}>
      <Handle type="target" position={Position.Left} className="wb-handle" />
      <div className="wb-title wb-drag">
        <input
          className="nodrag nopan"
          data-wb={id}
          aria-label="Название"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={() => {
            const next = title.trim();
            if (!next) {
              setTitle(data.title);
              return;
            }
            if (next !== data.title) api.patch(id, data.version, { title: next });
          }}
        />
        <button type="button" className="wb-x nodrag nopan" aria-label="Удалить задачу" onClick={() => api.remove(id)}>
          ×
        </button>
      </div>
      <div className="wb-body">
        <textarea
          className="nodrag nopan"
          data-wb={id}
          aria-label="Описание"
          rows={3}
          placeholder="Обязанности"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onBlur={() => {
            if (body !== data.body) api.patch(id, data.version, { body });
          }}
        />
        <div className="wb-statuses nodrag nopan">
          {BOARD_STATUSES.map((status) => (
            <button
              key={status.id}
              type="button"
              aria-pressed={data.status === status.id}
              onClick={() => {
                if (data.status !== status.id) api.patch(id, data.version, { status: status.id });
              }}
            >
              {status.label}
            </button>
          ))}
        </div>
        <select
          className="nodrag nopan"
          aria-label="Исполнитель"
          value={data.assigneeId ?? ""}
          onChange={(event) => api.patch(id, data.version, { assigneeId: event.target.value || null })}
        >
          <option value="">Не назначен</option>
          {data.assigneeId && !api.people.some((person) => person.id === data.assigneeId) ? (
            <option value={data.assigneeId}>{data.assigneeName || "Не в штате"}</option>
          ) : null}
          {api.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.position ? `${person.name}, ${person.position}` : person.name}
            </option>
          ))}
        </select>
        <label className="wb-meta nodrag nopan">
          Срок
          <input
            type="date"
            value={data.dueOn}
            onChange={(event) => api.patch(id, data.version, { dueOn: event.target.value })}
          />
        </label>
        {late ? <p className="wb-overdue">Просрочено</p> : null}
        <ProdPicker
          taskId={id}
          version={data.version}
          prodTaskId={data.prodTaskId}
          prodTaskTitle={data.prodTaskTitle}
        />
      </div>
      <Handle type="source" position={Position.Right} className="wb-handle" />
    </article>
  );
}

function AreaNode({ data }: NodeProps<AreaFlowNode>) {
  return (
    <div className="wb-area">
      <div className="wb-area-label">
        {data.title}
        <span>{data.count}</span>
      </div>
    </div>
  );
}

function FitFocus({ focus }: { focus: string }) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fitView({ padding: 0.16, duration: 380 });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [focus, fitView]);
  return null;
}

function ProdPicker({
  taskId,
  version,
  prodTaskId,
  prodTaskTitle,
}: {
  taskId: string;
  version: number;
  prodTaskId: string | null;
  prodTaskTitle: string;
}) {
  const api = useContext(BoardApiContext);
  const [hits, setHits] = useState<{ id: string; title: string }[]>([]);
  const [open, setOpen] = useState(false);
  return (
    <div className="wb-prod nodrag nopan">
      <span>Производство</span>
      {prodTaskId ? (
        <button type="button" onClick={() => api.patch(taskId, version, { prodTaskId: null })}>
          {prodTaskTitle || "Задача"} ×
        </button>
      ) : (
        <>
          <input
            aria-label="Найти производственную задачу"
            placeholder="Не связана"
            onFocus={() => {
              setOpen(true);
              void fetch("/api/board/prod-tasks")
                .then((res) => (res.ok ? res.json() : { tasks: [] }))
                .then((data: { tasks?: { id: string; title: string }[] }) => setHits(data.tasks ?? []));
            }}
            onChange={(event) => {
              const q = event.target.value;
              setOpen(true);
              void fetch(`/api/board/prod-tasks?q=${encodeURIComponent(q)}`)
                .then((res) => (res.ok ? res.json() : { tasks: [] }))
                .then((data: { tasks?: { id: string; title: string }[] }) => setHits(data.tasks ?? []));
            }}
          />
          {open && hits.length ? (
            <ul>
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      api.patch(taskId, version, { prodTaskId: hit.id });
                    }}
                  >
                    {hit.title}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}

const NONE_DEPT = "__none__";

function visibleTasks(tasks: BoardTask[], focus: string | null) {
  if (!focus) return tasks;
  if (focus === NONE_DEPT) return tasks.filter((task) => !task.departmentId);
  return tasks.filter((task) => task.departmentId === focus);
}

function visibleEdges(edges: BoardSnapshot["edges"], tasks: BoardTask[]) {
  const ids = new Set(tasks.map((task) => task.id));
  return edges.filter((edge) => ids.has(edge.fromId) && ids.has(edge.toId));
}

function departmentChips(tasks: BoardTask[]) {
  const counts = new Map<string, { title: string; count: number }>();
  for (const task of tasks) {
    const key = task.departmentId ?? NONE_DEPT;
    const title = key === NONE_DEPT ? "Без отдела" : task.departmentName || "Отдел";
    const row = counts.get(key) ?? { title, count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  return [...counts.entries()]
    .map(([key, row]) => ({ key, ...row }))
    .sort((a, b) => a.title.localeCompare(b.title, "ru"));
}

function focusLabel(tasks: BoardTask[], focus: string) {
  if (focus === NONE_DEPT) return "Без отдела";
  return tasks.find((task) => task.departmentId === focus)?.departmentName || "Отдел";
}

function buildBoardNodes(tasks: BoardTask[]): FlowNode[] {
  const groups = new Map<string, BoardTask[]>();
  for (const task of tasks) {
    const key = task.departmentId ?? NONE_DEPT;
    const list = groups.get(key) ?? [];
    list.push(task);
    groups.set(key, list);
  }
  const areas: AreaFlowNode[] = [];
  for (const [key, cards] of groups) {
    if (!cards.length) continue;
    const frame = areaFrame(cards);
    areas.push({
      id: `area:${key}`,
      type: "area",
      position: { x: frame.x, y: frame.y },
      data: {
        title: key === NONE_DEPT ? "Без отдела" : cards[0]?.departmentName || "Отдел",
        count: cards.length,
        deptKey: key,
      },
      style: { width: frame.width, height: frame.height },
      draggable: false,
      selectable: true,
      connectable: false,
      deletable: false,
      zIndex: 0,
    });
  }
  const cards: TaskFlowNode[] = tasks.map((task) => ({
    id: task.id,
    type: "task",
    position: { x: task.posX, y: task.posY },
    dragHandle: ".wb-drag",
    deletable: false,
    zIndex: 2,
    data: {
      title: task.title,
      body: task.body,
      status: task.status,
      assigneeId: task.assigneeId,
      assigneeName: task.assigneeName,
      departmentId: task.departmentId,
      dueOn: task.dueOn,
      prodTaskId: task.prodTaskId,
      prodTaskTitle: task.prodTaskTitle,
      version: task.version,
    },
  }));
  return [...areas, ...cards];
}

function toFlowEdges(edges: BoardSnapshot["edges"]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.fromId,
    target: edge.toId,
    type: "smoothstep",
    animated: true,
    label: edgeLabel(edge.kind),
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: EDGE_COLOR[edge.kind] },
    style: { stroke: EDGE_COLOR[edge.kind], strokeWidth: 2.4 },
    labelStyle: { fill: "#f6e7a8", fontWeight: 700, fontSize: 11 },
    labelBgStyle: { fill: "#1b1408", fillOpacity: 0.92 },
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 6,
  }));
}

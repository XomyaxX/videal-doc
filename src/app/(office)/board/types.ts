import type { BoardEdgeKind, BoardStatus } from "@/lib/work-board-graph";

export type BoardTask = {
  id: string;
  title: string;
  body: string;
  status: BoardStatus;
  assigneeId: string | null;
  assigneeName: string;
  departmentId: string | null;
  departmentName: string;
  dueOn: string;
  prodTaskId: string | null;
  prodTaskTitle: string;
  posX: number;
  posY: number;
  sortOrder: number;
  version: number;
};

export type BoardEdge = {
  id: string;
  fromId: string;
  toId: string;
  kind: BoardEdgeKind;
};

export type BoardSnapshot = {
  tasks: BoardTask[];
  edges: BoardEdge[];
  updatedAt: string;
};

export type BoardPerson = {
  id: string;
  name: string;
  position: string;
};

import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type {
  BoardNode,
  CaptureItem,
  Creation,
  LibraryData,
  Project,
  Shelf,
  Viewport,
} from "@myndshelf/types";
import { hueFrom, uid } from "./util";

export interface LibraryActions {
  addCapture(input: Partial<CaptureItem> & { title: string }): string;
  updateCapture(id: string, patch: Partial<CaptureItem>): void;
  removeCapture(id: string): void;

  addCreation(input: Partial<Creation> & Pick<Creation, "title" | "medium">): string;
  updateCreation(id: string, patch: Partial<Creation>): void;
  removeCreation(id: string): void;

  addShelf(name: string): string;
  renameShelf(id: string, name: string): void;
  removeShelf(id: string): void;

  createProject(name: string): string;
  updateProject(id: string, patch: Partial<Pick<Project, "name" | "description">>): void;
  removeProject(id: string): void;
  setViewport(projectId: string, viewport: Viewport): void;
  addNode(projectId: string, node: Omit<BoardNode, "id" | "rotation"> & { rotation?: number }): string;
  updateNode(projectId: string, nodeId: string, patch: Partial<BoardNode>): void;
  removeNode(projectId: string, nodeId: string): void;
  connect(projectId: string, from: string, to: string): void;
  disconnect(projectId: string, edgeId: string): void;
}

export type LibraryState = LibraryData & LibraryActions;

const empty: LibraryData = { captures: [], creations: [], shelves: [], projects: [] };

/**
 * Store do domínio, agnóstico de plataforma.
 * Cada app injeta seu `StateStorage` (IndexedDB no desktop, MMKV no mobile…).
 */
export function createLibraryStore(storage: StateStorage, name = "myndshelf-library") {
  return createStore<LibraryState>()(
    persist(
      (set, get) => {
        const patchProject = (id: string, fn: (p: Project) => Partial<Project>) =>
          set((s) => ({
            projects: s.projects.map((p) => (p.id === id ? { ...p, ...fn(p), updatedAt: Date.now() } : p)),
          }));

        /** Remove nós de quadros que apontam para um item apagado. */
        const dropRefs = (refId: string) =>
          set((s) => ({
            projects: s.projects.map((p) => {
              const gone = new Set(p.nodes.filter((n) => n.refId === refId).map((n) => n.id));
              if (!gone.size) return p;
              return {
                ...p,
                nodes: p.nodes.filter((n) => !gone.has(n.id)),
                edges: p.edges.filter((e) => !gone.has(e.from) && !gone.has(e.to)),
              };
            }),
          }));

        return {
          ...empty,

          addCapture(input) {
            const id = uid();
            const item: CaptureItem = {
              kind: "link",
              tags: [],
              status: "ready",
              createdAt: Date.now(),
              hue: hueFrom(input.url ?? input.title),
              ...input,
              id,
            };
            set((s) => ({ captures: [item, ...s.captures] }));
            return id;
          },
          updateCapture(id, patch) {
            set((s) => ({ captures: s.captures.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
          },
          removeCapture(id) {
            set((s) => ({ captures: s.captures.filter((c) => c.id !== id) }));
            dropRefs(id);
          },

          addCreation(input) {
            const id = uid();
            const item: Creation = {
              shelfId: null,
              featured: false,
              createdAt: Date.now(),
              hue: hueFrom(input.title),
              ...input,
              id,
            };
            set((s) => ({ creations: [item, ...s.creations] }));
            return id;
          },
          updateCreation(id, patch) {
            set((s) => ({ creations: s.creations.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
          },
          removeCreation(id) {
            set((s) => ({ creations: s.creations.filter((c) => c.id !== id) }));
            dropRefs(id);
          },

          addShelf(name) {
            const shelf: Shelf = { id: uid(), name, createdAt: Date.now() };
            set((s) => ({ shelves: [...s.shelves, shelf] }));
            return shelf.id;
          },
          renameShelf(id, name) {
            set((s) => ({ shelves: s.shelves.map((x) => (x.id === id ? { ...x, name } : x)) }));
          },
          removeShelf(id) {
            set((s) => ({
              shelves: s.shelves.filter((x) => x.id !== id),
              creations: s.creations.map((c) => (c.shelfId === id ? { ...c, shelfId: null } : c)),
            }));
          },

          createProject(name) {
            const now = Date.now();
            const project: Project = {
              id: uid(),
              name,
              nodes: [],
              edges: [],
              viewport: { x: 0, y: 0, zoom: 1 },
              hue: hueFrom(name + now),
              createdAt: now,
              updatedAt: now,
            };
            set((s) => ({ projects: [project, ...s.projects] }));
            return project.id;
          },
          updateProject(id, patch) {
            patchProject(id, () => patch);
          },
          removeProject(id) {
            set((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
          },
          setViewport(projectId, viewport) {
            set((s) => ({ projects: s.projects.map((p) => (p.id === projectId ? { ...p, viewport } : p)) }));
          },
          addNode(projectId, node) {
            const id = uid();
            const rotation = node.rotation ?? Math.round((Math.random() - 0.5) * 6 * 10) / 10;
            patchProject(projectId, (p) => ({ nodes: [...p.nodes, { ...node, rotation, id }] }));
            return id;
          },
          updateNode(projectId, nodeId, patch) {
            patchProject(projectId, (p) => ({ nodes: p.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }));
          },
          removeNode(projectId, nodeId) {
            patchProject(projectId, (p) => ({
              nodes: p.nodes.filter((n) => n.id !== nodeId),
              edges: p.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
            }));
          },
          connect(projectId, from, to) {
            if (from === to) return;
            const p = get().projects.find((x) => x.id === projectId);
            if (!p || p.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return;
            patchProject(projectId, (pp) => ({ edges: [...pp.edges, { id: uid(), from, to }] }));
          },
          disconnect(projectId, edgeId) {
            patchProject(projectId, (p) => ({ edges: p.edges.filter((e) => e.id !== edgeId) }));
          },
        };
      },
      {
        name,
        version: 1,
        storage: createJSONStorage(() => storage),
        partialize: ({ captures, creations, shelves, projects }) => ({ captures, creations, shelves, projects }),
      },
    ),
  );
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;

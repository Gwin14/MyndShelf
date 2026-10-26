import { createStore } from "zustand/vanilla";
import { persist, type PersistStorage, type StateStorage } from "zustand/middleware";
import type {
  BoardNode,
  CaptureItem,
  Creation,
  Feed,
  FeedEntry,
  LibraryData,
  Project,
  Shelf,
  Viewport,
} from "@myndshelf/types";
import type { ParsedEntry } from "./feed";
import { hueFrom, uid } from "./util";

const MAX_ENTRIES_PER_FEED = 150;

export interface LibraryActions {
  addCapture(input: Partial<CaptureItem> & { title: string }): string;
  updateCapture(id: string, patch: Partial<CaptureItem>): void;
  removeCapture(id: string): void;

  addFeed(input: Omit<Feed, "id" | "createdAt" | "hue">): string;
  updateFeed(id: string, patch: Partial<Feed>): void;
  removeFeed(id: string): void;
  /** Funde entradas novas mantendo lidas/salvas; na 1ª vez só as mais recentes ficam como novas. */
  mergeEntries(feedId: string, entries: ParsedEntry[], firstFetch?: boolean): number;
  updateEntry(id: string, patch: Partial<FeedEntry>): void;
  markFeedRead(feedId: string | null): void;

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

  /** Troca o acervo inteiro (importar um backup). */
  replaceLibrary(data: LibraryData): void;
}

export type LibraryState = LibraryData & LibraryActions;

/**
 * Grava o acervo só quando as mudanças param (ou a cada `maxWait`).
 * Com as prévias em data URL o JSON passa de alguns MB: serializar a cada
 * toque travava a interface, principalmente no celular.
 */
function deferredJSONStorage<S>(storage: StateStorage, delay = 800, maxWait = 5000): PersistStorage<S> & { flush(): Promise<void> } {
  let pending: { name: string; value: unknown } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let since = 0;
  const flush = async () => {
    clearTimeout(timer);
    timer = undefined;
    const p = pending;
    pending = undefined;
    if (p) await storage.setItem(p.name, JSON.stringify(p.value));
  };
  return {
    async getItem(name) {
      const raw = await storage.getItem(name);
      return raw ? JSON.parse(raw) : null;
    },
    setItem(name, value) {
      const now = Date.now();
      if (!pending) since = now;
      pending = { name, value };
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), Math.max(0, Math.min(delay, since + maxWait - now)));
    },
    removeItem(name) {
      pending = undefined;
      clearTimeout(timer);
      return storage.removeItem(name);
    },
    flush,
  };
}

const empty: LibraryData = { captures: [], feeds: [], feedEntries: [], creations: [], shelves: [], projects: [] };

/**
 * Store do domínio, agnóstico de plataforma.
 * Cada app injeta seu `StateStorage` (IndexedDB no desktop, MMKV no mobile…).
 */
export function createLibraryStore(storage: StateStorage, name = "myndshelf-library") {
  const persisted = deferredJSONStorage<Partial<LibraryState>>(storage);
  const store = createStore<LibraryState>()(
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

          addFeed(input) {
            const existing = get().feeds.find((f) => f.url === input.url);
            if (existing) return existing.id;
            const feed: Feed = { ...input, id: uid(), hue: hueFrom(input.url), createdAt: Date.now() };
            set((s) => ({ feeds: [...s.feeds, feed] }));
            return feed.id;
          },
          updateFeed(id, patch) {
            set((s) => ({ feeds: s.feeds.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
          },
          removeFeed(id) {
            set((s) => ({ feeds: s.feeds.filter((f) => f.id !== id), feedEntries: s.feedEntries.filter((e) => e.feedId !== id) }));
          },
          mergeEntries(feedId, entries, firstFetch) {
            const known = new Map(get().feedEntries.filter((e) => e.feedId === feedId).map((e) => [e.id, e]));
            let fresh = 0;
            const incoming = [...entries]
              .sort((a, b) => b.publishedAt - a.publishedAt)
              .map((p, i): FeedEntry => {
                const id = `${feedId}:${p.guid}`;
                const prev = known.get(id);
                if (!prev) fresh++;
                // entrada igual mantém o mesmo objeto: a sincronização só envia o que mudou
                if (
                  prev &&
                  prev.title === p.title &&
                  prev.url === p.url &&
                  prev.summary === p.summary &&
                  prev.image === p.image &&
                  prev.author === p.author &&
                  prev.publishedAt === p.publishedAt
                )
                  return prev;
                return {
                  id,
                  feedId,
                  title: p.title,
                  url: p.url,
                  summary: p.summary,
                  image: p.image,
                  author: p.author,
                  publishedAt: p.publishedAt,
                  read: prev ? prev.read : !!firstFetch && i >= 10,
                  savedAs: prev?.savedAs,
                };
              });
            const ids = new Set(incoming.map((e) => e.id));
            const kept = [...incoming, ...[...known.values()].filter((e) => !ids.has(e.id))]
              .sort((a, b) => b.publishedAt - a.publishedAt)
              .slice(0, MAX_ENTRIES_PER_FEED);
            set((s) => ({ feedEntries: [...s.feedEntries.filter((e) => e.feedId !== feedId), ...kept] }));
            return fresh;
          },
          updateEntry(id, patch) {
            set((s) => ({ feedEntries: s.feedEntries.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
          },
          markFeedRead(feedId) {
            set((s) => ({
              feedEntries: s.feedEntries.map((e) => (!feedId || e.feedId === feedId ? { ...e, read: true } : e)),
            }));
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

          replaceLibrary(data) {
            set({ ...empty, ...data });
          },
        };
      },
      {
        name,
        version: 1,
        storage: persisted,
        partialize: ({ captures, feeds, feedEntries, creations, shelves, projects }) => ({ captures, feeds, feedEntries, creations, shelves, projects }),
      },
    ),
  );
  /** Grava agora o que estiver pendente — chame quando o app for para o fundo ou a janela fechar. */
  return Object.assign(store, { flush: persisted.flush });
}

export type LibraryStore = ReturnType<typeof createLibraryStore>;

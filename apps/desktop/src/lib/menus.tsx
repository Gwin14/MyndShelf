import {
  ArrowRightLeft,
  BookOpen,
  Bookmark,
  CheckCheck,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FolderOpen,
  Image as ImageIcon,
  LayoutGrid,
  Library,
  Link2,
  MapPin,
  Orbit,
  PanelRight,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  Shapes,
  Sparkles,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import { describeFeedSource, KIND_LABELS, MEDIUM_LABELS, VIEW_LABELS, viewModeOf, type ViewMode } from "@myndshelf/core";
import type { CaptureItem, CaptureKind, Creation, CreationMedium, Feed, FeedEntry, Shelf } from "@myndshelf/types";
import { placeNode } from "./board";
import { captureText, refreshCapture } from "./capture";
import { copyText, sep, type MaybeEntry, type MenuEntry } from "./contextMenu";
import { docKindOf, docLabel } from "./documents";
import { entryAsItem, refreshFeed, subscribe } from "./feeds";
import { addCreationsFromFiles, pickFiles } from "./files";
import { FILE_MANAGER, isTauri, openExternal, openPath } from "./platform";
import { fileStore, library } from "./store";
import { toast } from "./toast";
import { useUi, type Section } from "./ui";

type Maybe = MaybeEntry;
const S = 14;
const ui = () => useUi.getState();
const lib = () => library.getState();

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  play: <Play size={S} />,
  read: <BookOpen size={S} />,
  image: <Eye size={S} />,
  map: <MapPin size={S} />,
};

/* ───────────────────────── submenus comuns ───────────────────────── */

/** Enviar para um projeto existente ou para um novo. */
function projectsSubmenu(kind: "capture" | "creation", refId: string): MenuEntry {
  const projects = lib().projects;
  return {
    label: "Adicionar a projeto",
    icon: <Orbit size={S} />,
    children: [
      ...projects.slice(0, 12).map(
        (p): MenuEntry => ({
          label: p.name,
          hint: p.nodes.some((n) => n.refId === refId) ? "já está" : undefined,
          onSelect: () => {
            placeNode(p.id, kind, refId);
            toast(`Adicionado a “${p.name}”`, { label: "Abrir", run: () => ui().set({ section: "projects", activeProjectId: p.id }) });
          },
        }),
      ),
      ...(projects.length ? [sep] : []),
      {
        label: "Novo projeto",
        icon: <Plus size={S} />,
        onSelect: () => {
          const id = lib().createProject("Novo projeto");
          placeNode(id, kind, refId);
          ui().set({ section: "projects", activeProjectId: id });
        },
      },
    ],
  };
}

/** Remover com "Desfazer" — sem diálogos de confirmação no caminho. */
function removeWithUndo(label: string, remove: () => void, restore: () => void, finalize?: () => void) {
  remove();
  let undone = false;
  toast(`“${label}” removido`, {
    label: "Desfazer",
    run: () => {
      undone = true;
      restore();
    },
  });
  if (finalize) window.setTimeout(() => !undone && finalize(), 5500);
}

/* ───────────────────────── Captura ───────────────────────── */

export function captureMenu(item: CaptureItem): Maybe[] {
  const mode = item.status === "ready" ? viewModeOf(item) : undefined;
  const source = item.url ? describeFeedSource(item.url) : undefined;
  const allTags = [...new Set(lib().captures.flatMap((c) => c.tags))].sort();

  return [
    { heading: item.title },
    { label: "Abrir detalhes", icon: <PanelRight size={S} />, onSelect: () => ui().set({ openCaptureId: item.id }) },
    mode && { label: VIEW_LABELS[mode], icon: VIEW_ICONS[mode], onSelect: () => ui().set({ viewerCaptureId: item.id }) },
    item.url && { label: "Abrir original", icon: <ExternalLink size={S} />, onSelect: () => void openExternal(item.url!) },
    sep,
    item.url && { label: "Copiar link", icon: <Link2 size={S} />, onSelect: () => copyText(item.url!) },
    { label: "Copiar título", icon: <Copy size={S} />, onSelect: () => copyText(item.title) },
    item.kind === "note" && item.note && { label: "Copiar texto", icon: <Copy size={S} />, onSelect: () => copyText(item.note!) },
    sep,
    {
      label: "Tipo de capa",
      icon: <Shapes size={S} />,
      hint: KIND_LABELS[item.kind],
      children: (Object.keys(KIND_LABELS) as CaptureKind[]).map((k) => ({
        label: KIND_LABELS[k],
        checked: item.kind === k,
        onSelect: () => lib().updateCapture(item.id, { kind: k }),
      })),
    },
    allTags.length > 0 && {
      label: "Etiquetas",
      icon: <Tag size={S} />,
      hint: item.tags.length ? String(item.tags.length) : undefined,
      children: [
        ...allTags.map(
          (t): MenuEntry => ({
            label: t,
            checked: item.tags.includes(t),
            onSelect: () =>
              lib().updateCapture(item.id, { tags: item.tags.includes(t) ? item.tags.filter((x) => x !== t) : [...item.tags, t] }),
          }),
        ),
        sep,
        { label: "Nova etiqueta…", icon: <Plus size={S} />, onSelect: () => ui().set({ openCaptureId: item.id }) },
      ],
    },
    projectsSubmenu("capture", item.id),
    sep,
    item.url &&
      !source?.unsupported && {
        label: "Seguir como transmissão",
        icon: <Radio size={S} />,
        hint: source?.label,
        onSelect: () =>
          void subscribe(item.url!)
            .then(({ id, via }) => {
              ui().set({ section: "capture", captureFeed: id });
              toast(`${via} encontrado`);
            })
            .catch((e) => toast(e instanceof Error ? e.message : "Nenhum feed encontrado")),
      },
    item.url && { label: "Buscar metadados de novo", icon: <RefreshCw size={S} />, onSelect: () => void refreshCapture(item.id) },
    sep,
    {
      label: "Remover",
      icon: <Trash2 size={S} />,
      danger: true,
      onSelect: () => {
        const snapshot = lib().projects;
        removeWithUndo(
          item.title,
          () => lib().removeCapture(item.id),
          () => library.setState((s) => ({ captures: [item, ...s.captures], projects: snapshot })),
        );
      },
    },
  ];
}

/* ───────────────────────── Transmissões (feeds) ───────────────────────── */

export function feedEntryMenu(entry: FeedEntry, feed: Feed | undefined, open: () => void): Maybe[] {
  const mode = viewModeOf(entryAsItem(entry, feed));
  return [
    { heading: entry.title },
    { label: mode ? VIEW_LABELS[mode] : "Abrir", icon: mode ? VIEW_ICONS[mode] : <ExternalLink size={S} />, onSelect: open },
    entry.url && { label: "Abrir original", icon: <ExternalLink size={S} />, onSelect: () => void openExternal(entry.url!) },
    sep,
    entry.url &&
      !entry.savedAs && {
        label: "Guardar na Captura",
        icon: <Bookmark size={S} />,
        onSelect: async () => {
          const id = await captureText(entry.url!);
          if (id) lib().updateEntry(entry.id, { savedAs: id, read: true });
          toast("Guardado na Captura");
        },
      },
    {
      label: entry.read ? "Marcar como nova" : "Marcar como lida",
      icon: <Circle size={S} />,
      onSelect: () => lib().updateEntry(entry.id, { read: !entry.read }),
    },
    entry.url && { label: "Copiar link", icon: <Link2 size={S} />, onSelect: () => copyText(entry.url!) },
    sep,
    feed && ui().captureFeed === "all" && { label: `Ir para ${feed.title}`, icon: <Radio size={S} />, onSelect: () => ui().set({ captureFeed: feed.id }) },
    feed && { label: "Marcar tudo deste feed como lido", icon: <CheckCheck size={S} />, onSelect: () => lib().markFeedRead(feed.id) },
  ];
}

export function feedMenu(feed: Feed): Maybe[] {
  return [
    { heading: feed.title },
    { label: "Abrir", icon: <Radio size={S} />, onSelect: () => ui().set({ section: "capture", captureFeed: feed.id }) },
    { label: "Atualizar agora", icon: <RefreshCw size={S} />, onSelect: () => void refreshFeed(feed.id).then(() => toast("Sintonizado")) },
    { label: "Marcar tudo como lido", icon: <CheckCheck size={S} />, onSelect: () => lib().markFeedRead(feed.id) },
    sep,
    feed.siteUrl && { label: "Abrir site", icon: <ExternalLink size={S} />, onSelect: () => void openExternal(feed.siteUrl!) },
    { label: "Copiar endereço do feed", icon: <Link2 size={S} />, onSelect: () => copyText(feed.url) },
    sep,
    {
      label: "Deixar de seguir",
      icon: <Trash2 size={S} />,
      danger: true,
      onSelect: () => {
        const entries = lib().feedEntries.filter((e) => e.feedId === feed.id);
        if (ui().captureFeed === feed.id) ui().set({ captureFeed: null });
        removeWithUndo(
          feed.title,
          () => lib().removeFeed(feed.id),
          () => library.setState((s) => ({ feeds: [...s.feeds, feed], feedEntries: [...s.feedEntries, ...entries] })),
        );
      },
    },
  ];
}

/* ───────────────────────── Estante ───────────────────────── */

async function exportCreation(c: Creation) {
  const blob = await fileStore.get(c.id);
  if (!blob) return toast("O arquivo original não está guardado");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = c.fileName ?? c.title;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function creationMenu(c: Creation): Maybe[] {
  const doc = docKindOf(c);
  const shelves = lib().shelves;
  const isFolder = c.medium === "folder";
  const onDisk = isTauri && !!c.filePath;

  return [
    { heading: c.title },
    { label: "Abrir detalhes", icon: <PanelRight size={S} />, onSelect: () => ui().set({ openCreationId: c.id }) },
    doc && { label: `Abrir ${docLabel(doc, c.fileName)}`, icon: <BookOpen size={S} />, onSelect: () => ui().set({ readingCreationId: c.id }) },
    isFolder && {
      label: `Abrir no ${FILE_MANAGER}`,
      icon: <FolderOpen size={S} />,
      disabled: !onDisk,
      onSelect: () => void openPath(c.filePath!).catch((e) => toast(String(e))),
    },
    !isFolder &&
      onDisk && { label: `Mostrar no ${FILE_MANAGER}`, icon: <Search size={S} />, onSelect: () => void openPath(c.filePath!, true).catch((e) => toast(String(e))) },
    sep,
    {
      label: c.featured ? "Tirar da vitrine" : "Pôr na vitrine",
      icon: <Star size={S} fill={c.featured ? "currentColor" : "none"} />,
      onSelect: () => lib().updateCreation(c.id, { featured: !c.featured }),
    },
    {
      label: "Mover para estante",
      icon: <ArrowRightLeft size={S} />,
      children: [
        { label: "Prateleira de entrada", checked: !c.shelfId, onSelect: () => lib().updateCreation(c.id, { shelfId: null }) },
        ...(shelves.length ? [sep] : []),
        ...shelves.map(
          (s): MenuEntry => ({ label: s.name, checked: c.shelfId === s.id, onSelect: () => lib().updateCreation(c.id, { shelfId: s.id }) }),
        ),
      ],
    },
    {
      label: "Suporte",
      icon: <Shapes size={S} />,
      hint: MEDIUM_LABELS[c.medium],
      children: (Object.keys(MEDIUM_LABELS) as CreationMedium[]).map((m) => ({
        label: MEDIUM_LABELS[m],
        checked: c.medium === m,
        onSelect: () => lib().updateCreation(c.id, { medium: m }),
      })),
    },
    projectsSubmenu("creation", c.id),
    sep,
    !isFolder && { label: "Exportar arquivo", icon: <Download size={S} />, onSelect: () => void exportCreation(c) },
    { label: "Copiar nome", icon: <Copy size={S} />, onSelect: () => copyText(c.fileName ?? c.title) },
    sep,
    {
      label: "Remover",
      icon: <Trash2 size={S} />,
      danger: true,
      onSelect: () => {
        const snapshot = lib().projects;
        removeWithUndo(
          c.title,
          () => lib().removeCreation(c.id),
          () => library.setState((s) => ({ creations: [c, ...s.creations], projects: snapshot })),
          // o arquivo original só é apagado depois que o "Desfazer" expira
          () => void fileStore.remove(c.id),
        );
      },
    },
  ];
}

export function shelfMenu(shelf: Shelf, rename: () => void): Maybe[] {
  const count = lib().creations.filter((c) => c.shelfId === shelf.id).length;
  return [
    { heading: shelf.name },
    { label: "Abrir", icon: <Library size={S} />, onSelect: () => ui().set({ section: "shelf", shelfFilter: shelf.id }) },
    {
      label: "Adicionar criações aqui…",
      icon: <Plus size={S} />,
      onSelect: async () => addCreationsFromFiles(await pickFiles("*/*"), shelf.id),
    },
    { label: "Renomear", icon: <Tag size={S} />, onSelect: rename },
    sep,
    {
      label: "Apagar estante",
      icon: <Trash2 size={S} />,
      hint: count ? `${count} voltam p/ entrada` : undefined,
      danger: true,
      onSelect: () => {
        const members = lib().creations.filter((c) => c.shelfId === shelf.id).map((c) => c.id);
        if (ui().shelfFilter === shelf.id) ui().set({ shelfFilter: "all" });
        removeWithUndo(
          shelf.name,
          () => lib().removeShelf(shelf.id),
          () =>
            library.setState((s) => ({
              shelves: [...s.shelves, shelf],
              creations: s.creations.map((c) => (members.includes(c.id) ? { ...c, shelfId: shelf.id } : c)),
            })),
        );
      },
    },
  ];
}

/* ───────────────────────── Projetos ───────────────────────── */

export function projectMenu(projectId: string, rename?: () => void): Maybe[] {
  const p = lib().projects.find((x) => x.id === projectId);
  if (!p) return [];
  return [
    { heading: p.name },
    { label: "Abrir", icon: <Orbit size={S} />, onSelect: () => ui().set({ section: "projects", activeProjectId: p.id }) },
    rename && { label: "Renomear", icon: <Tag size={S} />, onSelect: rename },
    sep,
    {
      label: "Apagar projeto",
      icon: <Trash2 size={S} />,
      hint: `${p.nodes.length} objetos`,
      danger: true,
      onSelect: () => {
        if (ui().activeProjectId === p.id) ui().set({ activeProjectId: null });
        removeWithUndo(
          p.name,
          () => lib().removeProject(p.id),
          () => library.setState((s) => ({ projects: [p, ...s.projects] })),
        );
      },
    },
  ];
}

/* ───────────────────────── fundo de cada seção ───────────────────────── */

const GO: { id: Section; label: string; key: string }[] = [
  { id: "capture", label: "Captura", key: "⌘1" },
  { id: "shelf", label: "Estante", key: "⌘2" },
  { id: "projects", label: "Projetos", key: "⌘3" },
];

export function sectionMenu(): Maybe[] {
  const { section, set } = ui();
  const goTo: MenuEntry = {
    label: "Ir para",
    icon: <Sparkles size={S} />,
    children: GO.map((g) => ({ label: g.label, hint: g.key, checked: section === g.id, onSelect: () => set({ section: g.id }) })),
  };
  const settings: MenuEntry = { label: "Ajustes…", icon: <Settings2 size={S} />, hint: "⌘,", onSelect: () => set({ settingsOpen: true }) };

  if (section === "capture") {
    return [
      {
        label: "Nova nota ou link",
        icon: <Plus size={S} />,
        hint: "⇧↵",
        onSelect: () => {
          set({ captureFeed: null });
          window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".addbar textarea")?.focus(), 50);
        },
      },
      {
        label: "Adicionar imagem…",
        icon: <ImageIcon size={S} />,
        onSelect: async () => {
          const { captureImageFile } = await import("./capture");
          (await pickFiles("image/*")).forEach((f) => void captureImageFile(f));
        },
      },
      sep,
      {
        label: "Mostrar",
        icon: <LayoutGrid size={S} />,
        children: [
          { label: "Tudo", checked: ui().captureKind === "all" && !ui().captureFeed, onSelect: () => set({ captureKind: "all", captureFeed: null }) },
          sep,
          ...(Object.keys(KIND_LABELS) as CaptureKind[])
            .filter((k) => lib().captures.some((c) => c.kind === k))
            .map((k) => ({ label: KIND_LABELS[k], checked: ui().captureKind === k && !ui().captureFeed, onSelect: () => set({ captureKind: k, captureFeed: null }) })),
        ],
      },
      lib().feeds.length > 0 && { label: "Todas as transmissões", icon: <Radio size={S} />, onSelect: () => set({ captureFeed: "all" }) },
      sep,
      goTo,
      settings,
    ];
  }

  if (section === "shelf") {
    const target = lib().shelves.some((s) => s.id === ui().shelfFilter) ? ui().shelfFilter : null;
    return [
      { label: "Adicionar criações…", icon: <Plus size={S} />, onSelect: async () => addCreationsFromFiles(await pickFiles("*/*"), target) },
      sep,
      {
        label: "Visualização",
        icon: <LayoutGrid size={S} />,
        children: [
          { label: "Estante", checked: ui().shelfView === "shelf", onSelect: () => set({ shelfView: "shelf" }) },
          { label: "Galeria", checked: ui().shelfView === "gallery", onSelect: () => set({ shelfView: "gallery" }) },
        ],
      },
      { label: "Só a vitrine", icon: <Star size={S} />, checked: ui().shelfFilter === "featured", onSelect: () => set({ shelfFilter: ui().shelfFilter === "featured" ? "all" : "featured" }) },
      sep,
      goTo,
      settings,
    ];
  }

  const active = ui().activeProjectId;
  return [
    {
      label: "Novo projeto",
      icon: <Plus size={S} />,
      onSelect: () => set({ activeProjectId: lib().createProject("Novo projeto") }),
    },
    active && { label: "Todos os projetos", icon: <Orbit size={S} />, onSelect: () => set({ activeProjectId: null }) },
    sep,
    goTo,
    settings,
  ];
}

/** Com texto selecionado em qualquer lugar: copiar ou guardar a seleção. */
export function selectionMenu(text: string): Maybe[] {
  const short = text.length > 40 ? `${text.slice(0, 38)}…` : text;
  return [
    { heading: `“${short}”` },
    { label: "Copiar", icon: <Copy size={S} />, hint: "⌘C", onSelect: () => copyText(text) },
    {
      label: "Guardar na Captura",
      icon: <Bookmark size={S} />,
      onSelect: () => void captureText(text).then(() => toast("Guardado na Captura")),
    },
  ];
}

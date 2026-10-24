import { Share } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import {
  ArrowRightLeft,
  BookOpen,
  Bookmark,
  CheckCheck,
  Circle,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Link2,
  MapPin,
  Orbit,
  PanelBottom,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Share2,
  Shapes,
  Star,
  Tag,
  Trash2,
} from "lucide-react-native";
import { describeFeedSource, KIND_LABELS, MEDIUM_LABELS, VIEW_LABELS, viewModeOf, type ViewMode } from "@myndshelf/core";
import type { CaptureItem, CaptureKind, Creation, CreationMedium, Feed, FeedEntry, Shelf } from "@myndshelf/types";
import { placeNode } from "./board";
import { refreshCapture, saveEntry } from "./capture";
import { refreshFeed, subscribe } from "./feeds";
import { docKindOf, removeCreationFiles, shareCreation } from "./files";
import { openExternal, openInApp } from "./platform";
import type { MaybeEntry, SheetEntry } from "./sheet";
import { library } from "./store";
import { toast } from "./toast";
import { useUi } from "./ui";
import { colors } from "./theme";

const S = 18;
const C = colors.paperDim;
const lib = () => library.getState();
const ui = () => useUi.getState();

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  play: <Play size={S} color={C} />,
  read: <BookOpen size={S} color={C} />,
  image: <Eye size={S} color={C} />,
  map: <MapPin size={S} color={C} />,
};

export function copyText(text: string, label = "Copiado") {
  void Clipboard.setStringAsync(text).then(() => toast(label));
}

/* ───────────────────────── submenus comuns ───────────────────────── */

/** Enviar para um projeto existente ou para um novo. */
export function projectsSubmenu(kind: "capture" | "creation", refId: string): SheetEntry {
  const projects = lib().projects;
  return {
    label: "Adicionar a projeto",
    icon: <Orbit size={S} color={C} />,
    children: [
      ...projects.slice(0, 20).map(
        (p): SheetEntry => ({
          label: p.name,
          hint: p.nodes.some((n) => n.refId === refId) ? "já está" : undefined,
          onSelect: () => {
            placeNode(p.id, kind, refId);
            toast(`Adicionado a “${p.name}”`, { label: "Abrir", run: () => router.push(`/project/${p.id}`) });
          },
        }),
      ),
      {
        label: "Novo projeto",
        icon: <Plus size={S} color={C} />,
        onSelect: () => {
          const id = lib().createProject("Novo projeto");
          placeNode(id, kind, refId);
          router.push(`/project/${id}`);
        },
      },
    ],
  };
}

/** Remover com "Desfazer" — sem diálogos de confirmação no caminho. */
export function removeWithUndo(label: string, remove: () => void, restore: () => void, finalize?: () => void) {
  remove();
  let undone = false;
  toast(`“${label}” removido`, {
    label: "Desfazer",
    run: () => {
      undone = true;
      restore();
    },
  });
  if (finalize) setTimeout(() => !undone && finalize(), 5500);
}

/* ───────────────────────── Captura ───────────────────────── */

export function removeCapture(item: CaptureItem) {
  const snapshot = lib().projects;
  removeWithUndo(
    item.title,
    () => lib().removeCapture(item.id),
    () => library.setState((s) => ({ captures: [item, ...s.captures], projects: snapshot })),
  );
}

export function captureMenu(item: CaptureItem, opts: { inDetail?: boolean } = {}): MaybeEntry[] {
  const mode = item.status === "ready" ? viewModeOf(item) : undefined;
  const source = item.url ? describeFeedSource(item.url) : undefined;
  const allTags = [...new Set(lib().captures.flatMap((c) => c.tags))].sort();

  return [
    !opts.inDetail && { label: "Abrir detalhes", icon: <PanelBottom size={S} color={C} />, onSelect: () => router.push(`/capture/${item.id}`) },
    mode && { label: VIEW_LABELS[mode], icon: VIEW_ICONS[mode], onSelect: () => router.push(`/view/${item.id}`) },
    item.url && { label: "Abrir no navegador", icon: <Globe size={S} color={C} />, onSelect: () => void openInApp(item.url!) },
    item.url && { label: "Abrir no app", icon: <ExternalLink size={S} color={C} />, onSelect: () => void openExternal(item.url!) },
    item.url && { label: "Compartilhar", icon: <Share2 size={S} color={C} />, onSelect: () => void Share.share({ url: item.url!, message: item.url!, title: item.title }) },
    item.url && { label: "Copiar link", icon: <Link2 size={S} color={C} />, onSelect: () => copyText(item.url!) },
    item.kind === "note" && item.note && { label: "Copiar texto", icon: <Copy size={S} color={C} />, onSelect: () => copyText(item.note!) },
    {
      label: "Tipo de capa",
      icon: <Shapes size={S} color={C} />,
      hint: KIND_LABELS[item.kind],
      children: (Object.keys(KIND_LABELS) as CaptureKind[]).map((k) => ({
        label: KIND_LABELS[k],
        checked: item.kind === k,
        onSelect: () => lib().updateCapture(item.id, { kind: k }),
      })),
    },
    allTags.length > 0 && {
      label: "Etiquetas",
      icon: <Tag size={S} color={C} />,
      hint: item.tags.length ? String(item.tags.length) : undefined,
      children: allTags.map((t) => ({
        label: t,
        checked: item.tags.includes(t),
        onSelect: () => {
          const now = lib().captures.find((c) => c.id === item.id) ?? item;
          lib().updateCapture(item.id, { tags: now.tags.includes(t) ? now.tags.filter((x) => x !== t) : [...now.tags, t] });
        },
      })),
    },
    projectsSubmenu("capture", item.id),
    item.url &&
      !source?.unsupported && {
        label: "Seguir como transmissão",
        icon: <Radio size={S} color={C} />,
        hint: source?.label,
        onSelect: () =>
          void subscribe(item.url!)
            .then(({ id, via }) => {
              ui().set({ captureMode: "feeds", captureFeed: id });
              router.navigate("/");
              toast(`${via} encontrado`);
            })
            .catch((e) => toast(e instanceof Error ? e.message : "Nenhum feed encontrado")),
      },
    item.url && { label: "Buscar metadados de novo", icon: <RefreshCw size={S} color={C} />, onSelect: () => void refreshCapture(item.id) },
    {
      label: "Remover",
      icon: <Trash2 size={S} color={colors.ember} />,
      danger: true,
      onSelect: () => {
        if (opts.inDetail && router.canGoBack()) router.back();
        removeCapture(item);
      },
    },
  ];
}

/* ───────────────────────── Transmissões (feeds) ───────────────────────── */

export function feedEntryMenu(entry: FeedEntry, open: () => void): MaybeEntry[] {
  const feed = lib().feeds.find((f) => f.id === entry.feedId);
  return [
    { label: "Abrir", icon: <BookOpen size={S} color={C} />, onSelect: open },
    entry.url && { label: "Abrir no navegador", icon: <Globe size={S} color={C} />, onSelect: () => void openInApp(entry.url!) },
    {
      label: entry.savedAs ? "Ver na Captura" : "Guardar na Captura",
      icon: <Bookmark size={S} color={C} />,
      onSelect: async () => {
        const id = await saveEntry(entry);
        if (id) toast("Guardado na Captura ✦", { label: "Abrir", run: () => router.push(`/capture/${id}`) });
      },
    },
    {
      label: entry.read ? "Marcar como nova" : "Marcar como lida",
      icon: <Circle size={S} color={C} />,
      onSelect: () => lib().updateEntry(entry.id, { read: !entry.read }),
    },
    entry.url && { label: "Compartilhar", icon: <Share2 size={S} color={C} />, onSelect: () => void Share.share({ url: entry.url!, message: entry.url! }) },
    feed && ui().captureFeed !== feed.id && { label: `Ir para ${feed.title}`, icon: <Radio size={S} color={C} />, onSelect: () => ui().set({ captureFeed: feed.id }) },
    feed && { label: "Marcar tudo deste feed como lido", icon: <CheckCheck size={S} color={C} />, onSelect: () => lib().markFeedRead(feed.id) },
  ];
}

export function feedMenu(feed: Feed): MaybeEntry[] {
  return [
    { label: "Atualizar agora", icon: <RefreshCw size={S} color={C} />, onSelect: () => void refreshFeed(feed.id).then(() => toast("Sintonizado")) },
    { label: "Marcar tudo como lido", icon: <CheckCheck size={S} color={C} />, onSelect: () => lib().markFeedRead(feed.id) },
    feed.siteUrl && { label: "Abrir site", icon: <Globe size={S} color={C} />, onSelect: () => void openInApp(feed.siteUrl!) },
    { label: "Copiar endereço do feed", icon: <Link2 size={S} color={C} />, onSelect: () => copyText(feed.url) },
    {
      label: "Deixar de seguir",
      icon: <Trash2 size={S} color={colors.ember} />,
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

export function removeCreation(c: Creation) {
  const snapshot = lib().projects;
  removeWithUndo(
    c.title,
    () => lib().removeCreation(c.id),
    () => library.setState((s) => ({ creations: [c, ...s.creations], projects: snapshot })),
    // o arquivo original só é apagado depois que o "Desfazer" expira
    () => removeCreationFiles(c.id),
  );
}

export function creationMenu(c: Creation, opts: { inDetail?: boolean } = {}): MaybeEntry[] {
  const doc = docKindOf(c);
  const shelves = lib().shelves;
  const canOpen = !!doc || /^(image|audio|video)$/.test(c.medium);
  return [
    !opts.inDetail && { label: "Abrir detalhes", icon: <PanelBottom size={S} color={C} />, onSelect: () => router.push(`/creation/${c.id}`) },
    canOpen && c.filePath && { label: "Abrir", icon: <BookOpen size={S} color={C} />, onSelect: () => router.push(`/creation/read/${c.id}`) },
    {
      label: c.featured ? "Tirar da vitrine" : "Pôr na vitrine",
      icon: <Star size={S} color={c.featured ? colors.amber : C} fill={c.featured ? colors.amber : "none"} />,
      onSelect: () => lib().updateCreation(c.id, { featured: !c.featured }),
    },
    {
      label: "Mover para estante",
      icon: <ArrowRightLeft size={S} color={C} />,
      children: [
        { label: "Prateleira de entrada", checked: !c.shelfId, onSelect: () => lib().updateCreation(c.id, { shelfId: null }) },
        ...shelves.map((s): SheetEntry => ({ label: s.name, checked: c.shelfId === s.id, onSelect: () => lib().updateCreation(c.id, { shelfId: s.id }) })),
      ],
    },
    {
      label: "Suporte",
      icon: <Shapes size={S} color={C} />,
      hint: MEDIUM_LABELS[c.medium],
      children: (Object.keys(MEDIUM_LABELS) as CreationMedium[]).map((m) => ({
        label: MEDIUM_LABELS[m],
        checked: c.medium === m,
        onSelect: () => lib().updateCreation(c.id, { medium: m }),
      })),
    },
    projectsSubmenu("creation", c.id),
    c.filePath && { label: "Compartilhar arquivo", icon: <Share2 size={S} color={C} />, onSelect: () => void shareCreation(c) },
    {
      label: "Remover",
      icon: <Trash2 size={S} color={colors.ember} />,
      danger: true,
      onSelect: () => {
        if (opts.inDetail && router.canGoBack()) router.back();
        removeCreation(c);
      },
    },
  ];
}

export function shelfMenu(shelf: Shelf, rename: () => void): MaybeEntry[] {
  const count = lib().creations.filter((c) => c.shelfId === shelf.id).length;
  return [
    { label: "Renomear", icon: <Tag size={S} color={C} />, onSelect: rename },
    {
      label: "Apagar estante",
      icon: <Trash2 size={S} color={colors.ember} />,
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

export function projectMenu(projectId: string, rename?: () => void, inBoard = false): MaybeEntry[] {
  const p = lib().projects.find((x) => x.id === projectId);
  if (!p) return [];
  return [
    !inBoard && { label: "Abrir", icon: <Orbit size={S} color={C} />, onSelect: () => router.push(`/project/${p.id}`) },
    rename && { label: "Renomear", icon: <Tag size={S} color={C} />, onSelect: rename },
    {
      label: "Apagar projeto",
      icon: <Trash2 size={S} color={colors.ember} />,
      hint: `${p.nodes.length} objetos`,
      danger: true,
      onSelect: () => {
        if (inBoard && router.canGoBack()) router.back();
        removeWithUndo(
          p.name,
          () => lib().removeProject(p.id),
          () => library.setState((s) => ({ projects: [p, ...s.projects] })),
        );
      },
    },
  ];
}

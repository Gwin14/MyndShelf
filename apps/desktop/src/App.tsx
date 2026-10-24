import { useEffect } from "react";
import { ContextMenu } from "./components/ContextMenu";
import { Settings } from "./components/Settings";
import { ToastHost } from "./components/Toast";
import { clean, sep, useContextMenu } from "./lib/contextMenu";
import { sectionMenu, selectionMenu } from "./lib/menus";
import { CaptureDetail } from "./features/capture/CaptureDetail";
import { Viewer } from "./features/capture/Viewer";
import { CreationDetail } from "./features/shelf/CreationDetail";
import { DocumentViewer } from "./features/shelf/DocumentViewer";
import { useLibrary } from "./lib/store";
import { Cosmos } from "./components/Cosmos";
import { Header } from "./components/Header";
import { CaptureSidebar } from "./features/capture/CaptureSidebar";
import { CaptureView } from "./features/capture/CaptureView";
import { ShelfSidebar } from "./features/shelf/ShelfSidebar";
import { ShelfView } from "./features/shelf/ShelfView";
import { ProjectsSidebar } from "./features/projects/ProjectsSidebar";
import { ProjectsView } from "./features/projects/ProjectsView";
import { startAutoTag } from "./lib/ai";
import { startNativeDrop } from "./lib/nativeDrop";
import { startQuickDropReceiver } from "./lib/quickDrop";
import { useUi, type Section } from "./lib/ui";

const KEYS: Record<string, Section> = { "1": "capture", "2": "shelf", "3": "projects" };

export function App() {
  const section = useUi((s) => s.section);
  const setSection = useUi((s) => s.setSection);
  const { openCaptureId, viewerCaptureId, openCreationId, readingCreationId, settingsOpen, set } = useUi();
  const viewerItem = useLibrary((s) => s.captures.find((c) => c.id === viewerCaptureId));
  const readingItem = useLibrary((s) => s.creations.find((c) => c.id === readingCreationId));

  useEffect(() => startNativeDrop(), []);
  useEffect(() => startQuickDropReceiver(), []);
  useEffect(() => startAutoTag(), []);

  // clique direito em qualquer lugar sem menu próprio: ações da seção (ou da seleção de texto)
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      if (e.defaultPrevented) return; // um card/item já abriu o menu dele
      const target = e.target as HTMLElement;
      // campos de texto mantêm o menu nativo (copiar, colar, correção ortográfica)
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      const selected = window.getSelection()?.toString().trim();
      const overlay = target.closest(".modal-backdrop, .viewer");
      const entries = clean([
        ...(selected ? [...selectionMenu(selected), sep] : []),
        ...(overlay
          ? [{ label: "Fechar", hint: "Esc", onSelect: () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })) }]
          : sectionMenu()),
      ]);
      if (entries.length) useContextMenu.getState().open(e.clientX, e.clientY, entries);
    };
    window.addEventListener("contextmenu", onContext);
    return () => window.removeEventListener("contextmenu", onContext);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && KEYS[e.key]) {
        e.preventDefault();
        setSection(KEYS[e.key]);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        useUi.getState().set({ settingsOpen: true });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSection]);

  return (
    <div className="app" data-section={section}>
      <Cosmos />
      <Header />
      <div className="app-body">
        <aside className="sidebar" key={`side-${section}`}>
          {section === "capture" && <CaptureSidebar />}
          {section === "shelf" && <ShelfSidebar />}
          {section === "projects" && <ProjectsSidebar />}
        </aside>
        <main className="stage" key={section}>
          {section === "capture" && <CaptureView />}
          {section === "shelf" && <ShelfView />}
          {section === "projects" && <ProjectsView />}
        </main>
      </div>

      {/* janelas por cima de tudo — abrem de qualquer seção (cards, quadro, menu de contexto) */}
      {openCaptureId && <CaptureDetail id={openCaptureId} onClose={() => set({ openCaptureId: null })} />}
      {viewerCaptureId && <Viewer item={viewerItem} onClose={() => set({ viewerCaptureId: null })} />}
      {openCreationId && <CreationDetail id={openCreationId} onClose={() => set({ openCreationId: null })} />}
      {readingItem && <DocumentViewer item={readingItem} onClose={() => set({ readingCreationId: null })} />}
      {settingsOpen && <Settings onClose={() => set({ settingsOpen: false })} />}
      <ContextMenu />
      <ToastHost />
    </div>
  );
}

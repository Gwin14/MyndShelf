import { useEffect } from "react";
import { Cosmos } from "./components/Cosmos";
import { Header } from "./components/Header";
import { CaptureSidebar } from "./features/capture/CaptureSidebar";
import { CaptureView } from "./features/capture/CaptureView";
import { ShelfSidebar } from "./features/shelf/ShelfSidebar";
import { ShelfView } from "./features/shelf/ShelfView";
import { ProjectsSidebar } from "./features/projects/ProjectsSidebar";
import { ProjectsView } from "./features/projects/ProjectsView";
import { startNativeDrop } from "./lib/nativeDrop";
import { useUi, type Section } from "./lib/ui";

const KEYS: Record<string, Section> = { "1": "capture", "2": "shelf", "3": "projects" };

export function App() {
  const section = useUi((s) => s.section);
  const setSection = useUi((s) => s.setSection);

  useEffect(() => startNativeDrop(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && KEYS[e.key]) {
        e.preventDefault();
        setSection(KEYS[e.key]);
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
    </div>
  );
}

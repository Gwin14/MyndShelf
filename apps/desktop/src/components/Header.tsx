import { useLibrary } from "../lib/store";
import { useUi, type Section } from "../lib/ui";

const NAV: { id: Section; numeral: string; label: string }[] = [
  { id: "capture", numeral: "I", label: "Captura" },
  { id: "shelf", numeral: "II", label: "Estante" },
  { id: "projects", numeral: "III", label: "Projetos" },
];

export function Header() {
  const section = useUi((s) => s.section);
  const setSection = useUi((s) => s.setSection);
  const total = useLibrary((s) => s.captures.length + s.creations.length);

  return (
    <header className="header" data-tauri-drag-region>
      <div className="brand" data-tauri-drag-region>
        <span className="brand-star" aria-hidden>✦</span>
        <span className="brand-name">
          Mynd<em>shelf</em>
        </span>
      </div>

      <nav className="nav" aria-label="Seções">
        {NAV.map((n) => (
          <button
            key={n.id}
            className="nav-item"
            aria-current={section === n.id ? "page" : undefined}
            onClick={() => setSection(n.id)}
          >
            <span className="nav-numeral">{n.numeral}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
        <span className="nav-flare" data-pos={NAV.findIndex((n) => n.id === section)} aria-hidden />
      </nav>

      <div className="header-meta" data-tauri-drag-region>
        <span className="mono">{String(total).padStart(3, "0")} objetos em órbita</span>
      </div>
    </header>
  );
}

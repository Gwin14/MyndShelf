import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Modal({ onClose, children, wide }: { onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal>
        <button className="icon-btn modal-close" onClick={onClose} aria-label="Fechar">
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

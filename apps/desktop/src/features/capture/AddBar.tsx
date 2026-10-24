import { useRef } from "react";
import { ImagePlus } from "lucide-react";
import { captureImageFile, captureText } from "../../lib/capture";
import { pickFiles } from "../../lib/files";
import { useUi } from "../../lib/ui";

/**
 * Um campo só para as três coisas: digitar já filtra o mural,
 * Tab pergunta ao acervo e ⇧↵ guarda como nota (ou link).
 */
export function AddBar() {
  const value = useUi((s) => s.captureQuery);
  const set = useUi((s) => s.set);
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  const clear = () => {
    set({ captureQuery: "" });
    requestAnimationFrame(fit);
  };

  return (
    <div className="addbar" data-filled={value.trim() ? true : undefined}>
      <span className="addbar-star" aria-hidden>
        ✦
      </span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        placeholder="Busque, pergunte ou escreva algo…"
        onChange={(e) => {
          set({ captureQuery: e.target.value });
          fit();
        }}
        onKeyDown={(e) => {
          const text = value.trim();
          if (e.key === "Enter" && e.shiftKey) {
            e.preventDefault();
            if (!text) return;
            void captureText(value);
            clear();
          } else if (e.key === "Tab" && !e.shiftKey && text) {
            e.preventDefault();
            set({ libraryQuestion: { q: text, n: Date.now() } });
            clear();
          } else if (e.key === "Escape" && value) {
            e.stopPropagation();
            clear();
          }
        }}
      />
      <button
        className="icon-btn"
        title="Adicionar imagem"
        onClick={async () => (await pickFiles("image/*")).forEach((f) => void captureImageFile(f))}
      >
        <ImagePlus size={17} />
      </button>
      <span className="addbar-keys mono" aria-hidden>
        <kbd>⇥ perguntar</kbd>
        <kbd>⇧↵ guardar</kbd>
      </span>
    </div>
  );
}

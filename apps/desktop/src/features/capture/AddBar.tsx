import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { captureImageFile, captureText } from "../../lib/capture";
import { pickFiles } from "../../lib/files";

export function AddBar() {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    void captureText(value);
    setValue("");
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
        placeholder="Cole um link, solte uma imagem ou escreva um pensamento…"
        onChange={(e) => {
          setValue(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
            e.currentTarget.style.height = "auto";
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
      <kbd className="addbar-kbd mono">↵ guardar</kbd>
    </div>
  );
}

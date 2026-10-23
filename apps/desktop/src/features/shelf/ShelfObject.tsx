import type { CSSProperties } from "react";
import type { Creation } from "@myndshelf/types";
import { codeLanguageOf } from "@myndshelf/core";

/**
 * A criação como objeto físico — contra a "não-coisa" digital (Byung-Chul Han):
 * imagem vira quadro, documento vira livro, áudio vira fita, vídeo vira VHS,
 * texto vira manuscrito e o resto vai para uma redoma de vidro.
 */
export function ShelfObject({ item }: { item: Creation }) {
  const style = { "--hue": item.hue } as CSSProperties;
  return (
    <div className={`obj obj-${item.medium}`} style={style}>
      {OBJECTS[item.medium](item)}
    </div>
  );
}

const OBJECTS: Record<Creation["medium"], (c: Creation) => React.JSX.Element> = {
  image: (c) => (
    <div className="obj-frame">
      <div className="obj-mat">
        {c.preview ? <img src={c.preview} alt="" draggable={false} /> : <div className="art art-fallback" />}
      </div>
    </div>
  ),
  document: (c) =>
    c.preview ? (
      // PDF: a primeira página vira a capa do livro
      <div className="obj-tome obj-tome-cover">
        <img src={c.preview} alt="" draggable={false} />
        <span className="obj-tome-spine" />
      </div>
    ) : (
    <div className="obj-tome">
      <span className="obj-tome-band" />
      <strong>{c.title}</strong>
      <span className="mono">{c.year}</span>
    </div>
    ),
  audio: (c) => (
    <div className="obj-tape">
      <div className="obj-tape-label">
        <span className="mono">Lado A</span>
        <strong>{c.title}</strong>
      </div>
      <div className="obj-tape-window">
        <i />
        <i />
      </div>
    </div>
  ),
  video: (c) => (
    <div className="obj-vhs">
      {c.preview && <img src={c.preview} alt="" draggable={false} />}
      <div className="obj-vhs-label">
        <strong>{c.title}</strong>
        <span className="mono">VHS · {c.year}</span>
      </div>
    </div>
  ),
  text: (c) => (
    <div className="obj-manuscript">
      <span className="obj-manuscript-sheet" />
      <span className="obj-manuscript-sheet" />
      <div className="obj-manuscript-top">
        <strong>{c.title}</strong>
        <span className="obj-lines" />
      </div>
    </div>
  ),
  code: (c) => {
    // um disquete para qualquer código; a cor e a etiqueta dizem a linguagem
    const lang = codeLanguageOf(c.fileName);
    return (
      <div className="obj-floppy" style={{ "--lang": lang.color } as CSSProperties}>
        <div className="obj-floppy-window">
          <span className="obj-floppy-disk" />
          <span className="obj-floppy-shutter">
            <i />
          </span>
        </div>
        <div className="obj-floppy-label">
          <span className="obj-floppy-lang mono">
            <span>{lang.name}</span>
            {lang.ext && <b>.{lang.ext}</b>}
          </span>
          <strong>{c.title}</strong>
          <span className="obj-floppy-lines" />
        </div>
        <span className="obj-floppy-notch" />
      </div>
    );
  },
  folder: (c) => (
    // pasta de arquivo: aba com etiqueta, papéis aparecendo, carimbo com a contagem
    <div className="obj-folder">
      <span className="obj-folder-back">
        <span className="obj-folder-tab mono">{c.fileName}</span>
      </span>
      <span className="obj-folder-paper" />
      <span className="obj-folder-paper" />
      <span className="obj-folder-front">
        <strong>{c.title}</strong>
        <span className="obj-folder-stamp mono">
          {c.folder?.items ?? 0} {c.folder?.items === 1 ? "item" : "itens"}
        </span>
      </span>
    </div>
  ),
  object: (c) => (
    <div className="obj-jar">
      <div className="obj-jar-glass">
        <span className="obj-jar-glow" />
      </div>
      <div className="obj-jar-base mono">{c.fileName?.split(".").pop() ?? "obj"}</div>
    </div>
  ),
};

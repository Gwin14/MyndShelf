import type { CSSProperties } from "react";
import type { CaptureItem } from "@myndshelf/types";
import { formatCoords, hostOf, KIND_LABELS } from "@myndshelf/core";
import { MapTiles } from "../../../components/MapTiles";
import { Play } from "lucide-react";
import { Art } from "./Art";

type Props = { item: CaptureItem };

/**
 * Cada tipo de referência ganha um objeto físico:
 * música → disco, livro → livro, vídeo → TV de tubo, filme → película,
 * leitura → recorte de revista, código → terminal, lugar → cartão-postal…
 */
export function Cover({ item }: Props) {
  const style = { "--hue": item.hue } as CSSProperties;
  if (item.status === "loading") return <LoadingCover style={style} />;
  const C = COVERS[item.kind] ?? LinkCover;
  return (
    <div className={`cover cover-${item.kind}`} style={style}>
      <C item={item} />
    </div>
  );
}

function LoadingCover({ style }: { style: CSSProperties }) {
  return (
    <div className="cover cover-loading" style={style}>
      <div className="cv-loading">
        <span className="cv-loading-orbit" />
        <span className="mono">recebendo sinal…</span>
      </div>
    </div>
  );
}

function MusicCover({ item }: Props) {
  return (
    <div className="cv-music">
      <div className="cv-disc">
        <div className="cv-disc-label">
          <Art src={item.image} />
        </div>
      </div>
      <div className="cv-sleeve">
        <Art src={item.image} />
        <span className="cv-sheen" />
      </div>
    </div>
  );
}

function PodcastCover({ item }: Props) {
  return (
    <div className="cv-podcast">
      <span className="cv-wave" />
      <span className="cv-wave" />
      <span className="cv-wave" />
      <div className="cv-podcast-disc">
        <Art src={item.image} />
      </div>
      <span className="cv-onair mono">no ar</span>
    </div>
  );
}

function BookCover({ item }: Props) {
  return (
    <div className="cv-book">
      <div className="cv-book-body">
        {item.image ? (
          <Art src={item.image} />
        ) : (
          <div className="cv-book-type">
            <span className="mono">{item.author ?? item.siteName}</span>
            <strong>{item.title}</strong>
            <span className="cv-book-star">✦</span>
          </div>
        )}
        <span className="cv-book-spine" />
        <span className="cv-sheen" />
      </div>
      <span className="cv-book-pages" />
    </div>
  );
}

function VideoCover({ item }: Props) {
  return (
    <div className="cv-tv">
      <div className="cv-tv-screen">
        <Art src={item.image} />
        <span className="cv-scanlines" />
        <span className="cv-tv-play">
          <Play size={16} fill="currentColor" />
        </span>
      </div>
      <div className="cv-tv-foot">
        <span className="mono">{hostOf(item.url) || "vídeo"}</span>
        <span className="cv-knobs">
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}

function FilmCover({ item }: Props) {
  return (
    <div className="cv-film">
      <div className="cv-film-frame">
        <Art src={item.image} />
      </div>
      <div className="cv-film-edge mono">
        <span>◂ 35MM</span>
        <span>{item.siteName}</span>
      </div>
    </div>
  );
}

function GameCover({ item }: Props) {
  return (
    <div className="cv-cart">
      <span className="cv-cart-grip" />
      <div className="cv-cart-label">
        <div className="cv-cart-art">
          {item.image ? <Art src={item.image} /> : <div className="art art-fallback cv-cart-title">{item.title}</div>}
          <span className="cv-sheen" />
        </div>
        <div className="cv-cart-band mono">
          <span>{item.siteName}</span>
          <span>✦</span>
        </div>
      </div>
      <span className="cv-cart-arrow">▲</span>
    </div>
  );
}

function ArticleCover({ item }: Props) {
  const issue = String((item.hue * 7) % 97).padStart(2, "0");
  return (
    <div className="cv-article">
      <div className="cv-article-mast mono">
        <span>{item.siteName ?? hostOf(item.url)}</span>
        <span>Nº {issue}</span>
      </div>
      <h3 className="cv-article-title">{item.title}</h3>
      {item.image && <Art src={item.image} className="cv-halftone" />}
      {item.description && <p className="cv-article-dek">{item.description}</p>}
    </div>
  );
}

function ImageCover({ item }: Props) {
  return (
    <div className="cv-print">
      <Art src={item.image} />
      <div className="cv-print-plate mono">
        <span>Pl. {String(item.hue % 64).padStart(2, "0")}</span>
        <span>{item.siteName}</span>
      </div>
    </div>
  );
}

function CodeCover({ item }: Props) {
  const path = (() => {
    try {
      return new URL(item.url!).pathname.replace(/^\//, "");
    } catch {
      return item.title;
    }
  })();
  return (
    <div className="cv-term">
      <div className="cv-term-bar">
        <i />
        <i />
        <i />
        <span className="mono">{hostOf(item.url)}</span>
      </div>
      <pre className="cv-term-body">
        <span className="cv-term-prompt">~ $</span> clone {path}
        {"\n\n"}
        <span className="cv-term-title">{item.title}</span>
        {item.description ? `\n${item.description.slice(0, 140)}` : ""}
        <span className="cv-term-caret" />
      </pre>
    </div>
  );
}

function PlaceCover({ item }: Props) {
  const p = item.place;
  if (p?.lat != null && p.lng != null) {
    return (
      <div className="cv-postcard cv-mapcard">
        <div className="cv-map">
          <MapTiles lat={p.lat} lng={p.lng} zoom={p.zoom ?? 15} />
          <span className="cv-map-tint" />
          <span className="cv-pin">
            <i />
          </span>
        </div>
        <div className="cv-stamp">
          <span>✦</span>
        </div>
        <span className="cv-mapcard-coords mono">{formatCoords(p.lat, p.lng)}</span>
      </div>
    );
  }
  return (
    <div className="cv-postcard">
      <Art src={item.image} />
      <div className="cv-stamp">
        <span>✦</span>
      </div>
      <span className="cv-postmark mono">{hostOf(item.url)}</span>
    </div>
  );
}

function NoteCover({ item }: Props) {
  return (
    <div className="cv-note">
      <span className="cv-note-hole" />
      <p className="cv-note-text">{item.note ?? item.title}</p>
      <span className="cv-note-date mono">
        {new Date(item.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
      </span>
    </div>
  );
}

function LinkCover({ item }: Props) {
  return (
    <div className="cv-link">
      {item.image ? (
        <Art src={item.image} />
      ) : (
        <div className="cv-link-flare">
          <span className="serif">{hostOf(item.url)}</span>
        </div>
      )}
      <span className="cv-link-tag mono">{item.status === "error" ? "sem sinal" : KIND_LABELS[item.kind]}</span>
    </div>
  );
}

const COVERS: Record<CaptureItem["kind"], (p: Props) => React.JSX.Element> = {
  music: MusicCover,
  podcast: PodcastCover,
  book: BookCover,
  video: VideoCover,
  film: FilmCover,
  game: GameCover,
  article: ArticleCover,
  image: ImageCover,
  code: CodeCover,
  place: PlaceCover,
  note: NoteCover,
  link: LinkCover,
};

/** Tipos cuja capa já carrega o texto — dispensam legenda. */
export const SELF_CAPTIONED = new Set<CaptureItem["kind"]>(["article", "note", "code"]);

import { useRef, useState } from "react";
import { ExternalLink, Heart, MessageCircle, Repeat2 } from "lucide-react";
import { formatCount, socialNetworkOf, SOCIAL_FORMAT_LABELS, SOCIAL_LABELS } from "@myndshelf/core";
import type { CaptureItem, SocialInfo, SocialMedia } from "@myndshelf/types";
import { Prose } from "../../components/Prose";
import { openExternal } from "../../lib/platform";
import { healCapture } from "../../lib/capture";

/**
 * Post de rede social. Cada rede ganha a forma que tem no próprio app:
 * X e Threads são um tuíte em coluna de texto; Reddit traz título e comentários;
 * Instagram põe a mídia em destaque (carrossel, reel ou vídeo) e a legenda ao lado.
 */
export function SocialPost({ item }: { item: CaptureItem }) {
  const s: SocialInfo = item.social ?? { network: socialNetworkOf(item.url) ?? "x", format: "post", media: [] };
  const images = s.media.filter((m) => m.type === "image");
  const video = s.media.find((m) => m.type === "video");
  const igPath = s.network === "instagram" ? item.url?.match(/\/(p|reel|reels|tv)\/([^/?#]+)/) : null;
  const mediaFirst = s.network === "instagram";

  // reel: o player da própria rede vem antes da capa
  const reelEmbed = !video && igPath && s.format === "reel";
  const media = (
    <>
      {video && <video className="post-video" src={video.url} poster={video.poster} controls playsInline preload="metadata" />}
      {!video && reelEmbed && (
        <>
          <iframe
            className="post-embed"
            src={`https://www.instagram.com/${igPath[1] === "reels" ? "reel" : igPath[1]}/${igPath[2]}/embed/`}
            title={item.title}
            allow="encrypted-media; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <button className="btn post-open" onClick={() => item.url && openExternal(item.url)}>
            <ExternalLink size={13} /> Se o reel não aparecer aqui, abrir no Instagram
          </button>
        </>
      )}
      {!video && !reelEmbed && images.length === 1 && <img className="post-image" src={images[0].url} alt={item.title} referrerPolicy="no-referrer" />}
      {!video && !reelEmbed && images.length > 1 && (images.length <= 4 && !mediaFirst ? <Grid images={images} /> : <Carousel images={images} />)}
    </>
  );

  const head = (
    <header className="post-head">
      <Avatar src={s.avatar} label={s.name ?? s.handle ?? SOCIAL_LABELS[s.network]} onFail={() => healCapture(item.id)} />
      <div className="post-who">
        <strong>{s.name ?? s.handle ?? SOCIAL_LABELS[s.network]}</strong>
        <span className="mono">{[s.handle && `@${s.handle}`, s.community && `r/${s.community}`].filter(Boolean).join(" · ")}</span>
      </div>
      <span className="post-badge mono">{SOCIAL_FORMAT_LABELS[s.format]}</span>
    </header>
  );

  const body =
    s.network === "reddit" ? (
      <>
        <h1 className="post-title">{item.title}</h1>
        {s.text ? (
          <Prose text={s.text} />
        ) : (
          <p className="post-note">
            O Reddit não entregou o texto deste post aqui. <button className="post-link" onClick={() => item.url && openExternal(item.url)}>Ler no Reddit</button>
          </p>
        )}
      </>
    ) : (
      s.text && (
        <div className="post-text">
          {s.text.split(/\n+/).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )
    );

  const stats = (s.likes != null || s.replies != null || s.reposts != null || s.publishedAt) && (
    <footer className="post-stats mono">
      {s.likes != null && (
        <span>
          <Heart size={13} /> {formatCount(s.likes)}
        </span>
      )}
      {s.replies != null && (
        <span>
          <MessageCircle size={13} /> {formatCount(s.replies)}
        </span>
      )}
      {s.reposts != null && (
        <span>
          <Repeat2 size={13} /> {formatCount(s.reposts)}
        </span>
      )}
      {s.publishedAt && (
        <time dateTime={new Date(s.publishedAt).toISOString()}>
          {new Date(s.publishedAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </time>
      )}
    </footer>
  );

  const comments = s.comments?.length ? (
    <section className="post-comments">
      <p className="kicker">Comentários em destaque</p>
      {s.comments.map((c, i) => (
        <div key={i} className="post-comment">
          <span className="mono">
            {c.author ? `u/${c.author}` : "anônimo"}
            {c.score != null && ` · ${formatCount(c.score)}`}
          </span>
          <p>{c.text}</p>
        </div>
      ))}
    </section>
  ) : null;

  if (mediaFirst) {
    return (
      <div className="post-scroll">
        <div className="post-split" data-format={s.format}>
          {(video || images.length || s.format === "reel") && <div className="post-stage">{media}</div>}
          <aside className="post-side">
            {head}
            {body}
            {stats}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="post-scroll">
      <article className="post-card" data-network={s.network}>
        {head}
        {body}
        {media}
        {comments}
        {stats}
      </article>
    </div>
  );
}

function Avatar({ src, label, onFail }: { src?: string; label: string; onFail: () => void }) {
  const [failed, setFailed] = useState<string>();
  if (src && failed !== src)
    return (
      <img
        className="post-avatar"
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => {
          setFailed(src);
          onFail();
        }}
      />
    );
  return <span className="post-avatar post-avatar-letter">{label.trim().charAt(0).toUpperCase()}</span>;
}

/** Carrossel: deslize com o dedo ou arraste; os pontos mostram onde você está. */
function Carousel({ images }: { images: SocialMedia[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const go = (i: number) => track.current?.scrollTo({ left: i * track.current.clientWidth, behavior: "smooth" });

  return (
    <div className="post-carousel">
      <div
        className="post-track"
        ref={track}
        onScroll={(e) => setIndex(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}
      >
        {images.map((m, i) => (
          <figure key={i} className="post-slide">
            <img src={m.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          </figure>
        ))}
      </div>
      <span className="post-count mono">
        {index + 1}/{images.length}
      </span>
      <div className="post-dots">
        {images.map((_, i) => (
          <button key={i} aria-label={`Imagem ${i + 1}`} aria-current={i === index} onClick={() => go(i)} />
        ))}
      </div>
    </div>
  );
}

function Grid({ images }: { images: SocialMedia[] }) {
  return (
    <div className="post-grid" data-count={images.length}>
      {images.map((m, i) => (
        <img key={i} src={m.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ))}
    </div>
  );
}

import { useEffect, useState } from "react";
import { AlignLeft, BookOpen, Expand, ExternalLink, MapPin, Play, Radio, RefreshCw, Trash2 } from "lucide-react";
import { describeFeedSource, KIND_LABELS, relativeDate, VIEW_LABELS, viewModeOf } from "@myndshelf/core";
import type { CaptureItem, CaptureKind } from "@myndshelf/types";
import { AddToProject } from "../../components/AddToProject";
import { Modal } from "../../components/Modal";
import { Smooth } from "../../components/Prose";
import { RunOutput, Thinking } from "../../components/RunOutput";
import { canSummarizeCapture, suggestTags, summarizeCapture, useAi, useAiRun, useGlow, warmCapture } from "../../lib/ai";
import { refreshCapture } from "../../lib/capture";
import { subscribe } from "../../lib/feeds";
import { openExternal } from "../../lib/platform";
import { library, useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { Cover } from "./covers/Cover";

export function CaptureDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useLibrary((s) => s.captures.find((c) => c.id === id));
  const [tagDraft, setTagDraft] = useState("");
  const setUi = useUi((s) => s.set);
  const [follow, setFollow] = useState<{ state: "idle" | "busy" | "error"; msg?: string }>({ state: "idle" });
  const summary = useAiRun();
  const working = useGlow((s) => !!s.working[id]);
  const fresh = useGlow((s) => s.fresh);
  const hasKey = useAi((s) => !!s.key);
  useEffect(() => {
    const it = library.getState().captures.find((c) => c.id === id);
    if (it) warmCapture(it);
  }, [id]);
  if (!item) return null;
  const summarizing = summary.state.status === "thinking" || summary.state.status === "streaming";
  const source = item.url ? describeFeedSource(item.url) : undefined;
  const canFollow = !!item.url && !source?.unsupported && (!!source || ["article", "link", "code", "podcast", "video"].includes(item.kind));
  const followFeed = async () => {
    setFollow({ state: "busy" });
    try {
      const { id: feedId } = await subscribe(item.url!);
      setUi({ captureFeed: feedId, openCaptureId: null });
    } catch (e) {
      setFollow({ state: "error", msg: e instanceof Error ? e.message : String(e) });
    }
  };
  const mode = item.status === "ready" ? viewModeOf(item) : undefined;
  const view = () => setUi({ viewerCaptureId: item.id });
  const update = (patch: Partial<CaptureItem>) =>
    library.getState().updateCapture(id, patch);

  return (
    <Modal onClose={onClose} wide>
      <div className="detail">
        <div className="detail-stage" data-kind={item.kind}>
          <div className="detail-cover" data-openable={mode ? true : undefined} onClick={mode ? view : undefined}>
            <Cover item={item} />
          </div>
        </div>

        <div className="detail-info">
          <p className="kicker">
            <select
              className="kind-select"
              value={item.kind}
              onChange={(e) => update({ kind: e.target.value as CaptureKind })}
              title="Mudar o tipo de capa"
            >
              {Object.entries(KIND_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            · guardado {relativeDate(item.createdAt)}
          </p>

          <input
            className="detail-title"
            value={item.title}
            onChange={(e) => update({ title: e.target.value })}
          />
          {(item.author || item.siteName) && (
            <p className="detail-sub">
              {item.author && <span>{item.author} · </span>}
              {item.siteName}
            </p>
          )}
          {item.description && <p className="detail-desc">{item.description}</p>}

          <Smooth>
            {summary.state.status !== "idle" && (
              <>
                <label className="label mono">Resumo</label>
                <div className="detail-summary">
                  <RunOutput state={summary.state} label="resumindo" onRetry={summary.retry} />
                </div>
              </>
            )}
          </Smooth>

          <label className="label mono">{item.kind === "note" ? "Texto" : "Anotação"}</label>
          <textarea
            className="field"
            placeholder="Por que isso te chamou atenção?"
            value={item.note ?? ""}
            onChange={(e) => update({ note: e.target.value })}
          />

          <label className="label mono">Etiquetas</label>
          <div className="tags">
            {item.tags.map((t) => (
              <button
                key={t}
                className="tag"
                data-glow={fresh[`${id}:tag:${t}`] || undefined}
                onClick={() => update({ tags: item.tags.filter((x) => x !== t) })}
              >
                {t} <span>×</span>
              </button>
            ))}
            {working ? (
              <span className="tag tag-working">
                <Thinking label="lendo" />
              </span>
            ) : (
              item.tags.length < 5 &&
              item.status === "ready" && (
                <button
                  className="tag tag-suggest"
                  title="Sugerir etiquetas a partir do conteúdo"
                  onClick={() => (hasKey ? void suggestTags(id).catch(() => {}) : setUi({ settingsOpen: true }))}
                >
                  ✦ sugerir
                </button>
              )
            )}
            <input
              className="tag-input"
              placeholder="+ etiqueta"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onKeyDown={(e) => {
                const t = tagDraft.trim().toLowerCase();
                if (e.key === "Enter" && t) {
                  if (!item.tags.includes(t)) update({ tags: [...item.tags, t] });
                  setTagDraft("");
                }
              }}
            />
          </div>

          <label className="label mono">Projetos</label>
          <AddToProject kind="capture" refId={item.id} />

          <div className="detail-actions">
            {mode && (
              <button className="btn btn-flare" onClick={view}>
                {mode === "play" ? <Play size={14} fill="currentColor" /> : mode === "read" ? <BookOpen size={14} /> : mode === "map" ? <MapPin size={14} /> : <Expand size={14} />}
                {VIEW_LABELS[mode]}
              </button>
            )}
            {item.url && (
              <>
                <button className={`btn ${mode ? "" : "btn-flare"}`} onClick={() => openExternal(item.url!)}>
                  <ExternalLink size={14} /> {mode ? "Original" : "Abrir"}
                </button>
                <button className="btn" onClick={() => refreshCapture(item.id)} title="Buscar metadados de novo">
                  <RefreshCw size={14} />
                </button>
              </>
            )}
            {canSummarizeCapture(item) && (
              <button
                className="btn"
                disabled={summarizing}
                onClick={() => summary.run((onText, signal) => summarizeCapture(item, onText, signal))}
              >
                <AlignLeft size={14} /> {summarizing ? "Resumindo…" : summary.state.status === "done" ? "Resumir de novo" : "Resumir"}
              </button>
            )}
            {canFollow && (
              <button className="btn" onClick={followFeed} disabled={follow.state === "busy"} title={source ? `Seguir: ${source.label}` : "Seguir o feed deste site"}>
                <Radio size={14} /> {follow.state === "busy" ? "Sintonizando…" : "Seguir"}
              </button>
            )}
            <button
              className="btn btn-danger"
              onClick={() => {
                library.getState().removeCapture(item.id);
                onClose();
              }}
            >
              <Trash2 size={14} /> Remover
            </button>
          </div>
          {follow.state === "error" && <p className="mono feed-follow-error">⚠ {follow.msg}</p>}
        </div>
      </div>
    </Modal>
  );
}

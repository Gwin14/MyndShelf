import { useEffect, useState } from "react";
import { AlignLeft, BookOpen, Download, FolderOpen, Search, Star, Trash2 } from "lucide-react";
import { formatBytes, MEDIUM_LABELS } from "@myndshelf/core";
import type { Creation, CreationMedium } from "@myndshelf/types";
import { AddToProject } from "../../components/AddToProject";
import { Modal } from "../../components/Modal";
import { Smooth } from "../../components/Prose";
import { RunOutput } from "../../components/RunOutput";
import { canReadCreation, summarizeCreation, useAiRun } from "../../lib/ai";
import { FILE_MANAGER, isTauri, openPath } from "../../lib/platform";
import { fileStore, library, useLibrary } from "../../lib/store";
import { docKindOf, docLabel } from "../../lib/documents";
import { DocumentViewer } from "./DocumentViewer";
import { ShelfObject } from "./ShelfObject";

/** Carrega o arquivo original guardado para tocar/ver dentro do app. */
function useBlobUrl(id: string) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let u: string | undefined;
    void fileStore.get(id).then((blob) => {
      if (blob) setUrl((u = URL.createObjectURL(blob)));
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);
  return url;
}

export function CreationDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const item = useLibrary((s) => s.creations.find((c) => c.id === id));
  const shelves = useLibrary((s) => s.shelves);
  const blobUrl = useBlobUrl(id);
  const [reading, setReading] = useState(false);
  const [pathError, setPathError] = useState<string>();
  const summary = useAiRun();
  if (!item) return null;
  const summarizing = summary.state.status === "thinking" || summary.state.status === "streaming";
  const canSummarize = canReadCreation(item) && item.medium !== "image";
  const docKind = docKindOf(item);
  const isFolder = item.medium === "folder";
  const openOriginal = (reveal: boolean) =>
    openPath(item.filePath!, reveal).catch((e) => setPathError(e instanceof Error ? e.message : String(e)));
  const update = (patch: Partial<Creation>) => library.getState().updateCreation(id, patch);

  return (
    <Modal onClose={onClose} wide>
      <div className="detail">
        <div className="detail-stage">
          <div className="detail-object">
            {item.medium === "image" && blobUrl ? (
              <img className="detail-media" src={blobUrl} alt="" />
            ) : item.medium === "video" && blobUrl ? (
              <video className="detail-media" src={blobUrl} controls poster={item.preview} />
            ) : isFolder ? (
              <button
                className="detail-doc"
                disabled={!item.filePath || !isTauri}
                onClick={() => openOriginal(false)}
                title={`Abrir no ${FILE_MANAGER}`}
              >
                <ShelfObject item={item} />
              </button>
            ) : docKind ? (
              <button className="detail-doc" onClick={() => setReading(true)} title="Abrir documento">
                <ShelfObject item={item} />
              </button>
            ) : (
              <ShelfObject item={item} />
            )}
            {item.medium === "audio" && blobUrl && <audio src={blobUrl} controls className="detail-audio" />}
          </div>
        </div>

        <div className="detail-info">
          <p className="kicker">
            <select
              className="kind-select"
              value={item.medium}
              onChange={(e) => update({ medium: e.target.value as CreationMedium })}
            >
              {Object.entries(MEDIUM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {item.size ? ` · ${formatBytes(item.size)}` : ""}
          </p>
          <input className="detail-title" value={item.title} onChange={(e) => update({ title: e.target.value })} />
          <p className="detail-sub">{item.fileName}</p>

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

          <div className="row-2">
            <div>
              <label className="label mono">Ano</label>
              <input
                className="field"
                type="number"
                value={item.year ?? ""}
                onChange={(e) => update({ year: e.target.value ? Number(e.target.value) : undefined })}
              />
            </div>
            <div>
              <label className="label mono">Estante</label>
              <select
                className="field"
                value={item.shelfId ?? ""}
                onChange={(e) => update({ shelfId: e.target.value || null })}
              >
                <option value="">Prateleira de entrada</option>
                {shelves.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="label mono">Sobre esta obra</label>
          <textarea
            className="field"
            placeholder="Contexto, processo, o que ela significa…"
            value={item.notes ?? ""}
            onChange={(e) => update({ notes: e.target.value })}
          />

          {isFolder && item.folder && item.folder.sample.length > 0 && (
            <>
              <label className="label mono">Dentro da pasta · {item.folder.items}</label>
              <ul className="folder-list mono">
                {item.folder.sample.map((n) => (
                  <li key={n} data-dir={n.endsWith("/") || undefined}>
                    {n}
                  </li>
                ))}
                {item.folder.items > item.folder.sample.length && <li className="folder-more">+ {item.folder.items - item.folder.sample.length}</li>}
              </ul>
            </>
          )}

          <label className="label mono">Projetos</label>
          <AddToProject kind="creation" refId={item.id} />

          <div className="detail-actions">
            {isFolder && (
              <button className="btn btn-flare" disabled={!item.filePath || !isTauri} onClick={() => openOriginal(false)}>
                <FolderOpen size={14} /> Abrir no {FILE_MANAGER}
              </button>
            )}
            {!isFolder && item.filePath && isTauri && (
              <button className="btn" onClick={() => openOriginal(true)}>
                <Search size={14} /> Mostrar no {FILE_MANAGER}
              </button>
            )}
            {docKind && (
              <button className="btn btn-flare" onClick={() => setReading(true)}>
                <BookOpen size={14} /> Abrir {docLabel(docKind, item.fileName)}
              </button>
            )}
            {canSummarize && (
              <button
                className="btn"
                disabled={summarizing}
                onClick={() => summary.run((onText, signal) => summarizeCreation(item, onText, signal))}
              >
                <AlignLeft size={14} /> {summarizing ? "Resumindo…" : summary.state.status === "done" ? "Resumir de novo" : "Resumir"}
              </button>
            )}
            <button
              className={`btn ${item.featured ? "btn-flare" : ""}`}
              onClick={() => update({ featured: !item.featured })}
            >
              <Star size={14} fill={item.featured ? "currentColor" : "none"} />
              {item.featured ? "Na vitrine" : "Pôr na vitrine"}
            </button>
            {blobUrl && (
              <a className="btn" href={blobUrl} download={item.fileName}>
                <Download size={14} /> Exportar
              </a>
            )}
            <button
              className="btn btn-danger"
              onClick={() => {
                library.getState().removeCreation(id);
                void fileStore.remove(id);
                onClose();
              }}
            >
              <Trash2 size={14} /> Remover
            </button>
          </div>
          {pathError && <p className="mono feed-follow-error">⚠ {pathError}</p>}
          {isFolder && (!item.filePath || !isTauri) && (
            <p className="mono folder-hint">Abrir a pasta original funciona no app desktop, com a pasta arrastada do {FILE_MANAGER}.</p>
          )}
        </div>
      </div>
      {reading && <DocumentViewer item={item} onClose={() => setReading(false)} />}
    </Modal>
  );
}

import { useEffect, useState } from "react";
import { Download, Star, Trash2 } from "lucide-react";
import { formatBytes, MEDIUM_LABELS } from "@myndshelf/core";
import type { Creation, CreationMedium } from "@myndshelf/types";
import { AddToProject } from "../../components/AddToProject";
import { Modal } from "../../components/Modal";
import { fileStore, library, useLibrary } from "../../lib/store";
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
  if (!item) return null;
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

          <label className="label mono">Projetos</label>
          <AddToProject kind="creation" refId={item.id} />

          <div className="detail-actions">
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
        </div>
      </div>
    </Modal>
  );
}

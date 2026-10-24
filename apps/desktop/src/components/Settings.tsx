import { useState } from "react";
import { useAi } from "../lib/ai";
import { openExternal } from "../lib/platform";
import { Modal } from "./Modal";

export function Settings({ onClose }: { onClose: () => void }) {
  const { key, autoTag, setKey, setAutoTag } = useAi();
  const [draft, setDraft] = useState(key);
  const dirty = draft.trim() !== key;

  return (
    <Modal onClose={onClose}>
      <div className="settings">
        <p className="kicker">Ajustes</p>
        <h2 className="settings-title">Gemini</h2>
        <p className="settings-sub">
          Etiquetas, resumos, leitura de documentos e as perguntas do campo da Captura usam a API do Gemini. A chave fica guardada só neste
          computador.
        </p>

        <label className="label mono">Chave da API</label>
        <div className="key-row">
          <input
            className="field"
            type="password"
            placeholder="Cole aqui"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && dirty && setKey(draft)}
          />
          <button className="btn" disabled={!dirty} onClick={() => setKey(draft)}>
            Guardar
          </button>
        </div>
        <button className="key-link mono" onClick={() => openExternal("https://aistudio.google.com/apikey")}>
          criar uma chave no Google AI Studio ↗
        </button>

        <label className="settings-toggle">
          <input type="checkbox" checked={autoTag} onChange={(e) => setAutoTag(e.target.checked)} />
          <span>
            <strong>Etiquetar ao guardar</strong>
            Capturas novas ganham etiquetas de assunto, reaproveitando as que você já usa. Links sem tipo definido ganham a capa
            certa.
          </span>
        </label>
      </div>
    </Modal>
  );
}

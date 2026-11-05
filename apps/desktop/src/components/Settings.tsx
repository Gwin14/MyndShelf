import { useEffect, useState } from "react";
import { useAi } from "../lib/ai";
import { APP_ICONS, iconUrl, useAppIcon } from "../lib/appIcon";
import { useAutostart } from "../lib/autostart";
import { exportLibrary, importLibrary } from "../lib/backup";
import { disableDrive, driveStore, enableDrive, fileManagerName, followServer, refreshDrive } from "../lib/drive";
import { isTauri, openExternal, openPath } from "../lib/platform";
import { suggestedServer, sync, useSync } from "../lib/sync";
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
        <ServerAiNote />

        <label className="settings-toggle">
          <input type="checkbox" checked={autoTag} onChange={(e) => setAutoTag(e.target.checked)} />
          <span>
            <strong>Etiquetar ao guardar</strong>
            Capturas novas ganham etiquetas de assunto, reaproveitando as que você já usa. Links sem tipo definido ganham a capa
            certa.
          </span>
        </label>

        <IconSettings />

        {isTauri && <StartupSettings />}

        <ServerSettings />

        <h2 className="settings-title settings-section">Acervo</h2>
        <p className="settings-sub">Exporte tudo em JSON para levar ao celular ou guardar uma cópia. Os arquivos originais da Estante ficam neste computador; vão só as prévias.</p>
        <div className="key-row">
          <button className="btn" onClick={exportLibrary}>
            Exportar
          </button>
          <label className="btn">
            Importar
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void importLibrary(file);
              }}
            />
          </label>
        </div>
      </div>
    </Modal>
  );
}

function IconSettings() {
  const { icon, setIcon } = useAppIcon();
  return (
    <>
      <h2 className="settings-title settings-section">Ícone</h2>
      <p className="settings-sub">{isTauri ? "Como o MyndShelf aparece no Dock e no Finder." : "Como o MyndShelf aparece na aba e ao salvar o site na tela de início."}</p>
      <div className="icon-picker">
        {APP_ICONS.map((i) => (
          <button key={i.name} className={`icon-option${i.name === icon ? " is-on" : ""}`} onClick={() => void setIcon(i.name)} aria-pressed={i.name === icon}>
            <span className="icon-ring">
              <img src={iconUrl(i.name)} alt="" width={78} height={78} />
            </span>
            <span className="mono">{i.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function StartupSettings() {
  const { enabled, busy, error, refresh, set } = useAutostart();
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <>
      <h2 className="settings-title settings-section">Inicialização</h2>
      <label className="settings-toggle">
        <input type="checkbox" checked={enabled} disabled={busy} onChange={(e) => void set(e.target.checked)} />
        <span>
          <strong>Abrir com o computador, em segundo plano</strong>
          O MyndShelf liga junto com o sistema sem abrir a janela: a caixa da bandeja e a Estante no {fileManagerName} ficam prontas.
          Fechar a janela também só a esconde; para encerrar de vez, use Sair no ícone da bandeja.
        </span>
      </label>
      {error && <p className="sync-line sync-error">{error}</p>}
    </>
  );
}

function ServerAiNote() {
  const ai = useSync((s) => s.ai);
  if (!ai) return null;
  return <p className="settings-sub settings-note">Sem chave aqui, a IA passa pelo seu servidor, que guarda a dele.</p>;
}

function syncLine(s: ReturnType<typeof sync.status.getState>): string {
  const queue = [s.pending && `${s.pending} ${s.pending === 1 ? "mudança" : "mudanças"} na fila`, s.pendingFiles && `${s.pendingFiles} ${s.pendingFiles === 1 ? "arquivo" : "arquivos"} para subir`]
    .filter(Boolean)
    .join(" · ");
  if (s.phase === "syncing") return "Sincronizando…";
  if (s.phase === "offline") return `Sem conexão com o servidor. ${queue || "Nada pendente"}; tudo continua funcionando aqui.`;
  if (s.phase === "error") return s.error ?? "Algo deu errado.";
  const when = s.lastSync ? new Date(s.lastSync).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "ainda não";
  return `Última sincronização: ${when}${queue ? ` · ${queue}` : ""}.`;
}

/** Self-hosted: liga este computador ao servidor do homelab. */
function ServerSettings() {
  const status = useSync((s) => s);
  const [url, setUrl] = useState(status.url ?? suggestedServer);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await sync.connect({ url, token });
      setToken("");
      void followServer();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2 className="settings-title settings-section">Servidor</h2>
      {status.url ? (
        <>
          <p className="settings-sub">
            Sincronizando com <span className="mono">{status.url.replace(/^https?:\/\//, "")}</span>. O acervo vive neste computador e funciona
            sem conexão; as mudanças sobem quando o servidor responde.
          </p>
          <p className={`sync-line sync-${status.phase}`}>
            <span className="sync-dot" /> {syncLine(status)}
          </p>
          <div className="key-row">
            <button className="btn" disabled={status.phase === "syncing"} onClick={() => void sync.now()}>
              Sincronizar agora
            </button>
            <button className="btn" onClick={() => void disableDrive().then(() => sync.disconnect())}>
              Desconectar
            </button>
          </div>
          <label className="settings-toggle">
            <input type="checkbox" checked={status.keepFiles} onChange={(e) => sync.setKeepFiles(e.target.checked)} />
            <span>
              <strong>Manter arquivos offline</strong>
              Baixa todos os originais da Estante. Desligado, cada arquivo desce quando você abre e fica guardado aqui.
            </span>
          </label>
          {isTauri && <DriveSettings />}
        </>
      ) : (
        <>
          <p className="settings-sub">
            Ligue ao seu servidor self-hosted (pelo Tailscale) para ter o mesmo acervo no celular, no site e aqui. Sem servidor, tudo fica só
            neste computador.
          </p>
          <label className="label mono">Endereço</label>
          <input className="field" placeholder="https://myndshelf.seu-tailnet.ts.net" value={url} onChange={(e) => setUrl(e.target.value)} />
          <label className="label mono">Token</label>
          <div className="key-row">
            <input
              className="field"
              type="password"
              placeholder="MYNDSHELF_TOKEN do servidor"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url && token && void connect()}
            />
            <button className="btn" disabled={busy || !url.trim() || !token.trim()} onClick={() => void connect()}>
              {busy ? "Conectando…" : "Conectar"}
            </button>
          </div>
          {error && <p className="sync-line sync-error">{error}</p>}
        </>
      )}
    </>
  );
}

/** A Estante como pasta do sistema, igual Google Drive / Proton Drive. */
function DriveSettings() {
  const d = driveStore();
  useEffect(() => {
    void refreshDrive();
  }, []);
  if (!d.supported) return null;
  return (
    <>
      <label className="settings-toggle">
        <input type="checkbox" checked={d.enabled} disabled={d.busy} onChange={(e) => void (e.target.checked ? enableDrive() : disableDrive())} />
        <span>
          <strong>Mostrar a Estante no {fileManagerName}</strong>
          Cada estante vira uma pasta. Os arquivos baixam quando você abre; o que você soltar, renomear ou apagar ali vale para o acervo.
          {d.busy && " Ligando…"}
        </span>
      </label>
      {d.enabled && d.running && d.location && (
        <div className="key-row">
          <button className="btn" onClick={() => void openPath(d.location!)}>
            Abrir pasta
          </button>
          <span className="settings-sub mono">{d.location}</span>
        </div>
      )}
      {d.enabled && d.running && !d.location && <p className="settings-sub settings-note">Aparece na barra lateral do Finder, em Locais.</p>}
      {d.error && <p className="sync-line sync-error">{d.error}</p>}
    </>
  );
}

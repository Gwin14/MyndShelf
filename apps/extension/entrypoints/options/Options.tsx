import { useEffect, useState, type FormEvent } from "react";
import { browser } from "#imports";
import { checkServer } from "../../lib/api";
import { send } from "../../lib/send";
import { cleanServerUrl, originPattern, outbox, server, type ServerSettings } from "../../lib/settings";

export function Options() {
  const [current, setCurrent] = useState<ServerSettings | null | undefined>();
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void server.getValue().then((s) => {
      setCurrent(s);
      if (s) setUrl(s.url);
    });
    void outbox.getValue().then((o) => setPending(o.length));
    const unwatch = [server.watch((s) => setCurrent(s)), outbox.watch((o) => setPending(o?.length ?? 0))];
    return () => unwatch.forEach((u) => u());
  }, []);

  async function connect(e: FormEvent) {
    e.preventDefault();
    setError("");
    const s = { url: cleanServerUrl(url), token: token.trim() };
    let origin: string;
    try {
      origin = originPattern(s.url);
    } catch {
      return setError("Endereço inválido.");
    }
    if (!s.token) return setError("Cole o token do servidor (MYNDSHELF_TOKEN).");
    // tem de ser a primeira coisa do clique: o navegador só mostra o pedido durante o gesto
    const granted = await browser.permissions.request({ origins: [origin] }).catch(() => false);
    if (!granted) return setError("Sem a permissão para falar com esse endereço, a extensão não consegue guardar.");
    setBusy(true);
    try {
      await checkServer(s);
      await server.setValue(s);
      setToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (current) await browser.permissions.remove({ origins: [originPattern(current.url)] }).catch(() => {});
    await server.setValue(null);
  }

  if (current === undefined) return null;

  return (
    <main className="options-main">
      <h1 className="title">
        MyndShelf <i>✦</i> <span>captura do navegador</span>
      </h1>
      <p className="lede">
        A extensão guarda links, imagens e trechos direto no seu servidor self-hosted. Os apps recebem na próxima sincronização — o desktop não precisa
        estar aberto.
      </p>

      <section className="card">
        <h2>Servidor</h2>
        {current ? (
          <div className="connected">
            <p>
              Conectado a <code>{current.url}</code>
            </p>
            <button className="ghost" onClick={() => void disconnect()}>
              desconectar
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void connect(e)}>
            <label>
              Endereço
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://homelab.seu-tailnet.ts.net" autoFocus spellCheck={false} />
            </label>
            <label>
              Token
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="MYNDSHELF_TOKEN" spellCheck={false} />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={busy}>
              {busy ? "Conferindo…" : "Conectar"}
            </button>
          </form>
        )}
        {pending > 0 && (
          <p className="queue">
            {pending === 1 ? "1 captura esperando o servidor." : `${pending} capturas esperando o servidor.`}{" "}
            <button className="ghost" onClick={() => void send({ type: "flush" })}>
              enviar agora
            </button>
          </p>
        )}
      </section>

      <section className="card">
        <h2>Como guardar</h2>
        <ul className="ways">
          <li>
            <b>Ícone da extensão</b> ou <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>: mostra a página, com espaço para um comentário.
          </li>
          <li>
            <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>: guarda a aba na hora, sem abrir nada. O selo do ícone confirma.
          </li>
          <li>
            <b>Botão direito</b> numa página, link, imagem ou texto selecionado (o texto vira nota).
          </li>
        </ul>
        <p className="hint">Os atalhos podem ser trocados na página de atalhos de extensões do navegador.</p>
      </section>
    </main>
  );
}

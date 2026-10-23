import { isProbablyUrl, parseCoordinates } from "@myndshelf/core";
import { captureText } from "./capture";
import { addDroppedPaths } from "./files";
import { isTauri, pathInfo, readDroppedFile } from "./platform";
import { useUi } from "./ui";

/** O que a caixa da bandeja manda para a janela principal. */
export interface QuickDropRequest {
  id: string;
  paths?: string[];
  text?: string;
}

export interface QuickDropResult {
  id: string;
  items: { name: string; where: "estante" | "captura" | "erro" }[];
}

/** Atalhos de link salvos do navegador (.webloc no Mac, .url no Windows). */
const LINK_FILE = /\.(webloc|url|desktop)$/i;

/** Texto arrastado: cada linha com link vira uma captura; texto solto vira nota. */
async function captureDroppedText(text: string): Promise<QuickDropResult["items"]> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const links = lines.filter((l) => isProbablyUrl(l) || parseCoordinates(l));
  const targets = links.length ? links : [text.trim()];
  const out: QuickDropResult["items"] = [];
  for (const t of targets) {
    await captureText(t);
    out.push({ name: t.length > 60 ? `${t.slice(0, 57)}…` : t, where: "captura" });
  }
  return out;
}

export async function handleQuickDrop(req: Omit<QuickDropRequest, "id">): Promise<QuickDropResult["items"]> {
  const items: QuickDropResult["items"] = [];
  if (req.text) items.push(...(await captureDroppedText(req.text)));

  for (const path of req.paths ?? []) {
    const name = path.split(/[\\/]/).pop() ?? path;
    try {
      if (LINK_FILE.test(name)) {
        const raw = await (await readDroppedFile(path, name)).text();
        const url = raw.match(/<string>(https?:\/\/[^<]+)<\/string>/)?.[1] ?? raw.match(/^URL=(\S+)/m)?.[1];
        if (url) {
          items.push(...(await captureDroppedText(url)));
          continue;
        }
      }
      await addDroppedPaths([path], null);
      items.push({ name: (await pathInfo(path)).name, where: "estante" });
    } catch {
      items.push({ name, where: "erro" });
    }
  }
  return items;
}

/**
 * Janela principal: recebe o que foi solto na caixa da bandeja e links
 * arrastados direto para a própria janela (que o Tauri não entrega como arquivo).
 */
export function startQuickDropReceiver(): () => void {
  if (!isTauri) return () => {};
  let disposed = false;
  const stops: (() => void)[] = [];

  void (async () => {
    const [{ getCurrentWebviewWindow }, { emitTo }] = await Promise.all([
      import("@tauri-apps/api/webviewWindow"),
      import("@tauri-apps/api/event"),
    ]);
    const win = getCurrentWebviewWindow();
    const listeners = await Promise.all([
      win.listen<QuickDropRequest>("quick-drop", async ({ payload }) => {
        const items = await handleQuickDrop(payload);
        await emitTo("dropzone", "quick-drop-done", { id: payload.id, items } satisfies QuickDropResult);
      }),
      win.listen<string>("drop-text", ({ payload }) => {
        if (useUi.getState().section !== "projects") void captureDroppedText(payload);
      }),
    ]);
    if (disposed) listeners.forEach((u) => u());
    else stops.push(...listeners);
  })();

  return () => {
    disposed = true;
    stops.forEach((u) => u());
  };
}

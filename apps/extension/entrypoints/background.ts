import { browser, defineBackground, type Browser } from "#imports";
import type { CaptureInput } from "../lib/capture";
import { flush, save, type SaveResult } from "../lib/queue";
import { outbox, server } from "../lib/settings";
import { isCapturable, snapshot } from "../lib/tab";

export type Message = { type: "save"; input: CaptureInput } | { type: "flush" };

const RETRY = "retry-outbox";

export default defineBackground(() => {
  /* ─────────── menu de contexto ─────────── */

  browser.runtime.onInstalled.addListener(async () => {
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({ id: "page", title: "Guardar página no MyndShelf", contexts: ["page", "frame"] });
    browser.contextMenus.create({ id: "link", title: "Guardar link no MyndShelf", contexts: ["link"] });
    browser.contextMenus.create({ id: "image", title: "Guardar imagem no MyndShelf", contexts: ["image"] });
    browser.contextMenus.create({ id: "selection", title: "Guardar seleção como nota", contexts: ["selection"] });
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const pageUrl = info.pageUrl ?? tab?.url;
    if (info.menuItemId === "link" && info.linkUrl) return void quick({ type: "page", url: info.linkUrl, title: info.selectionText });
    if (info.menuItemId === "image" && info.srcUrl) return void quick({ type: "image", src: info.srcUrl, pageUrl, title: tab?.title });
    if (info.menuItemId === "selection" && info.selectionText) return void quick({ type: "text", text: info.selectionText, source: pageUrl });
    if (tab) void quickTab(tab);
  });

  /* ─────────── atalho: guarda a aba sem abrir o popup ─────────── */

  browser.commands.onCommand.addListener(async (command, tab) => {
    if (command !== "capture-tab") return;
    const t = tab ?? (await browser.tabs.query({ active: true, currentWindow: true }))[0];
    if (t) void quickTab(t);
  });

  /* ─────────── popup ─────────── */

  browser.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
    // o trabalho fica aqui: se o popup fechar no meio, a captura não se perde
    const run = msg.type === "save" ? save(msg.input).then(afterSave) : flush().then(syncRetry);
    run.then(reply, (e) => reply({ ok: false, error: String(e) }));
    return true;
  });

  /* ─────────── fila: tenta de novo até o servidor responder ─────────── */

  browser.alarms.onAlarm.addListener((a) => a.name === RETRY && void flush().then(syncRetry));
  browser.runtime.onStartup.addListener(() => void flush().then(syncRetry));
  server.watch(() => void flush().then(syncRetry));
  outbox.watch((items) => badgeCount(items?.length ?? 0));
  void outbox.getValue().then((items) => badgeCount(items.length));
});

async function quickTab(tab: Browser.tabs.Tab) {
  if (!isCapturable(tab.url)) return flash("!", "#d42a6a");
  const page = await snapshot(tab);
  return quick({ type: "page", url: tab.url!, title: tab.title, html: page.html });
}

/** Captura sem interface: o selo do ícone conta o que aconteceu. */
async function quick(input: CaptureInput) {
  flash("…", "#2a4bff", 0);
  const res = await save(input).then(afterSave);
  if (!res.ok) flash("!", "#d42a6a");
  else if (res.queued) flash("⏳", "#ffb43d");
  else flash("✓", "#1f9d6b");
}

async function afterSave(res: SaveResult) {
  if (res.ok && res.queued) await syncRetry(1);
  return res;
}

async function syncRetry(pending: number) {
  if (pending) await browser.alarms.create(RETRY, { periodInMinutes: 2 });
  else await browser.alarms.clear(RETRY);
  return pending;
}

let flashTimer: ReturnType<typeof setTimeout> | undefined;
let flashing = false;

/** Aviso no selo; `ms = 0` fica até o próximo aviso. */
function flash(text: string, color: string, ms = 2500) {
  clearTimeout(flashTimer);
  flashing = true;
  void browser.action.setBadgeBackgroundColor({ color });
  void browser.action.setBadgeText({ text });
  if (!ms) return;
  flashTimer = setTimeout(() => {
    flashing = false;
    void outbox.getValue().then((i) => badgeCount(i.length));
  }, ms);
}

/** Fora dos avisos, o selo mostra quantos itens esperam na fila. */
function badgeCount(n: number) {
  if (flashing) return;
  void browser.action.setBadgeBackgroundColor({ color: "#ffb43d" });
  void browser.action.setBadgeText({ text: n ? String(n) : "" });
}

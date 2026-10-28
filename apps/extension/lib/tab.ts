import { browser, type Browser } from "#imports";

export interface PageSnapshot {
  html?: string;
  selection?: string;
}

/** Páginas onde o navegador não deixa extensões rodarem (chrome://, about:, lojas…). */
export const isCapturable = (url?: string) => !!url && /^(https?|file):/i.test(url);

/**
 * HTML e seleção da aba, lidos com a permissão `activeTab` que o clique
 * (ícone, menu ou atalho) concede. Falha em silêncio: o servidor lê a página.
 */
export async function snapshot(tab: Browser.tabs.Tab): Promise<PageSnapshot> {
  if (!tab.id || !isCapturable(tab.url)) return {};
  try {
    const [res] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({
        html: document.documentElement.outerHTML.slice(0, 2_500_000),
        selection: getSelection()?.toString().trim() ?? "",
      }),
    });
    return (res?.result as PageSnapshot | undefined) ?? {};
  } catch {
    return {};
  }
}

export async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab as Browser.tabs.Tab | undefined;
}

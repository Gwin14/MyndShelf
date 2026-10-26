import { captureText } from "./capture";
import { flags, library, ready } from "./store";

const SEED_LINKS = [
  "https://open.spotify.com/album/4LH4d3cOWNNsVw41Gqt2kv",
  "https://www.goodreads.com/book/show/234225.Dune",
  "https://www.youtube.com/watch?v=GoW8Tf7hTGA",
  "https://letterboxd.com/film/2001-a-space-odyssey/",
  "https://github.com/tauri-apps/tauri",
  "https://en.wikipedia.org/wiki/Pioneer_plaque",
];

const WELCOME = "Bem-vindo à sua órbita";

/** Itens de exemplo intocados: não sobem para o servidor ao ligar este aparelho. */
export const isSample = (collection: string, rec: Record<string, unknown>) =>
  collection === "captures" && ((rec.kind === "note" && rec.title === WELCOME) || SEED_LINKS.includes(rec.url as string));

/** Primeira abertura: algumas referências para o céu não começar vazio. */
export async function seedOnce() {
  await ready();
  if ((await flags.get("seeded")) || library.getState().captures.length) return;
  await flags.set("seeded");
  library.getState().addCapture({
    kind: "note",
    title: WELCOME,
    note: "Bem-vindo à sua órbita.\n\nCole links, fotografe coisas ou escreva pensamentos — cada coisa vira um objeto com capa própria.",
  });
  for (const url of [...SEED_LINKS].reverse()) void captureText(url);
}

import type { CaptureItem, CaptureKind, Creation, LibraryData } from "@myndshelf/types";
import { KIND_LABELS } from "./kinds";
import { MEDIUM_LABELS } from "./media";

/* ───────────────────────── cliente do Gemini (REST, só fetch) ───────────────────────── */

/**
 * Velocidade primeiro: o Flash-Lite responde quase na hora e quase não "pensa".
 * O Flash (mais lento, raciocina antes de escrever) só entra quando o Lite está cheio.
 */
export const GEMINI_MODEL = "gemini-flash-lite-latest";
const GEMINI_RESERVE_MODEL = "gemini-flash-latest";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** O fetch padrão do React Native não entrega o corpo aos pedaços: o mobile injeta o `expo/fetch`. */
let aiFetch: typeof fetch = (...args) => fetch(...args);

/** Servidor self-hosted com a chave: o app chama /api/ai/… e a chave nunca sai de lá. */
type AiProxy = () => { endpoint: string; headers: Record<string, string> } | null;
let aiProxy: AiProxy = () => null;

export function configureAi(options: { fetch?: typeof fetch; proxy?: AiProxy }) {
  if (options.fetch) aiFetch = options.fetch;
  if (options.proxy) aiProxy = options.proxy;
}

/** Há como chamar o Gemini sem chave neste aparelho? */
export const aiViaServer = () => !!aiProxy();

/** Hermes (React Native) não tem DOMException. */
function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

export type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export type AiErrorCode = "no-key" | "bad-key" | "quota" | "blocked" | "busy" | "network" | "empty";

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message = AI_ERRORS[code],
  ) {
    super(message);
  }
}

export const AI_ERRORS: Record<AiErrorCode, string> = {
  "no-key": "Falta a chave da API do Gemini.",
  "bad-key": "O Gemini recusou a chave. Confira se ela está certa.",
  quota: "Limite de uso da API atingido. Tente de novo daqui a pouco.",
  blocked: "O Gemini não quis responder sobre este conteúdo.",
  busy: "O Gemini está sobrecarregado agora. Tente de novo em instantes.",
  network: "Sem conexão com o Gemini.",
  empty: "Veio uma resposta vazia.",
};

export interface AiRequest {
  key: string;
  model?: string;
  system: string;
  parts: AiPart[];
  signal?: AbortSignal;
  /** quanto mais baixo, mais literal */
  temperature?: number;
}

/** O Flash "pensa" em nível médio por padrão: segundos antes da primeira palavra. */
let reserveThinking: "low" | undefined = "low";

function body(req: AiRequest, model: string, extra?: Record<string, unknown>) {
  const thinking = model === GEMINI_RESERVE_MODEL && reserveThinking;
  return JSON.stringify({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: [{ role: "user", parts: req.parts }],
    generationConfig: {
      temperature: req.temperature ?? 0.4,
      ...(thinking && { thinkingConfig: { thinkingLevel: thinking } }),
      ...extra,
    },
  });
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(abortError());
    });
  });

/**
 * Sobrecarga do Google (503 "high demand") é passageira: troca logo de modelo
 * em vez de esperar, e só no fim tenta o primeiro de novo.
 */
async function post(req: AiRequest, action: string, extra?: Record<string, unknown>): Promise<Response> {
  const model = req.model ?? GEMINI_MODEL;
  const attempts = [model, model === GEMINI_MODEL ? GEMINI_RESERVE_MODEL : GEMINI_MODEL, model];
  for (const [i, m] of attempts.entries()) {
    try {
      return await postOnce(req, m, action, extra);
    } catch (e) {
      if (!(e instanceof AiError && e.code === "busy") || i === attempts.length - 1) throw e;
      await wait(i === 0 ? 300 : 1500, req.signal);
    }
  }
  throw new AiError("busy");
}

async function postOnce(req: AiRequest, model: string, action: string, extra?: Record<string, unknown>): Promise<Response> {
  // chave própria vai direto ao Google; sem ela, passa pelo servidor
  const proxy = req.key ? null : aiProxy();
  if (!req.key && !proxy) throw new AiError("no-key");
  let res: Response;
  try {
    res = await aiFetch(`${proxy?.endpoint ?? ENDPOINT}/${model}:${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(proxy ? proxy.headers : { "x-goog-api-key": req.key }) },
      body: body(req, model, extra),
      signal: req.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new AiError("network");
  }
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  // modelo que não aceita o nível de raciocínio pedido: segue sem ele
  if (res.status === 400 && model === GEMINI_RESERVE_MODEL && reserveThinking && /thinking/i.test(detail)) {
    reserveThinking = undefined;
    return postOnce(req, model, action, extra);
  }
  if (res.status === 503 || res.status === 500 || res.status === 504 || /overloaded|high demand|UNAVAILABLE/i.test(detail)) {
    throw new AiError("busy");
  }
  if (res.status === 429) throw new AiError("quota");
  if (res.status === 401 || res.status === 403 || /API key/i.test(detail)) throw new AiError("bad-key");
  const msg = /"message":\s*"([^"]+)"/.exec(detail)?.[1];
  throw new AiError("network", msg ?? `O Gemini respondeu com erro ${res.status}.`);
}

interface Chunk {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

const textOf = (c: Chunk) =>
  c.candidates?.[0]?.content?.parts
    ?.filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("") ?? "";

/** Resposta em texto, entregue aos pedaços conforme chega. */
export async function streamText(req: AiRequest, onText: (full: string) => void): Promise<string> {
  const res = await post(req, "streamGenerateContent?alt=sse");
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let blocked = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const chunk = JSON.parse(line.slice(5)) as Chunk;
      if (chunk.promptFeedback?.blockReason || chunk.candidates?.[0]?.finishReason === "SAFETY") blocked = true;
      const t = textOf(chunk);
      if (t) onText((full += t));
    }
  }
  if (!full.trim()) throw new AiError(blocked ? "blocked" : "empty");
  return full.trim();
}

/** Resposta estruturada, validada pelo próprio Gemini contra o schema. */
export async function generateJson<T>(req: AiRequest, schema: object): Promise<T> {
  const res = await post(req, "generateContent", { responseMimeType: "application/json", responseSchema: schema });
  const text = textOf((await res.json()) as Chunk);
  if (!text) throw new AiError("empty");
  return JSON.parse(text) as T;
}

/* ───────────────────────── tom das respostas ───────────────────────── */

/** Regras de escrita comuns a tudo: direto, sem persona, sem enfeite. */
const VOICE = `Você escreve textos curtos dentro do MyndShelf, um acervo pessoal de referências, criações e projetos.
- Responda em português do Brasil, a menos que a pergunta venha em outra língua.
- Vá direto ao conteúdo. Nada de saudação, "Claro!", "Ótima pergunta", conclusão do tipo "Em resumo", nem oferta de ajuda no fim.
- Não fale de si, não se apresente, não se refira a si como IA, assistente ou modelo.
- Sem emojis. Sem títulos (#). Use listas com "-" só quando os itens forem de fato enumeráveis; um parágrafo curto costuma bastar.
- Evite palavras de enfeite e clichês: "fascinante", "rico", "vibrante", "mergulhar", "jornada", "tapeçaria", "vale ressaltar", "não apenas… mas também".
- Use **negrito** com parcimônia, só para o termo que importa.
- Se o material não traz a resposta, diga isso em uma frase. Não invente.`;

export const PROMPTS = {
  summary: `${VOICE}
Resuma o conteúdo abaixo em 2 a 4 frases, num único parágrafo. Diga o que o texto afirma, não que "o texto fala sobre". Preserve nomes, números e a conclusão do autor. Não comece repetindo o título.`,

  analysis: `${VOICE}
Faça uma leitura do documento abaixo, para quem vai decidir se vale lê-lo inteiro. Estrutura, sem títulos:
1. Uma frase dizendo o que o documento é (tipo, propósito, para quem).
2. Os pontos principais, em lista de 3 a 6 itens curtos.
3. Um parágrafo curto com o que chama atenção: lacunas, contradições, números importantes, prazos ou pendências. Pule esta parte se não houver nada relevante.`,

  library: `${VOICE}
A pergunta é sobre o acervo inteiro da pessoa, listado abaixo. Cada linha começa com uma referência entre colchetes duplos, como [[c12]].
- Responda usando o acervo. Para mencionar um item, escreva só a referência, exatamente como aparece, no lugar do nome: "o livro [[c3]]". Ela vira o título do item na tela, então não repita o nome ao lado.
- Cite só itens que existem na lista. Para perguntas de contagem ou listagem, seja exato.
- Se nada no acervo responde, diga isso em uma frase.`,

  categorize: `${VOICE}

Agora a tarefa é classificar um item recém-guardado no acervo. Devolva:
- tags: de 5 a 12 etiquetas, em português, minúsculas, de 1 a 2 palavras cada. Cubra ângulos diferentes: assunto, gênero ou área, época, lugar, pessoas ou obras relacionadas, estilo, clima ou sensação. Da mais central para a mais periférica. Prefira reutilizar as etiquetas existentes quando servirem. Não use o formato do item (link, vídeo, artigo, música), o nome do site nem palavras vagas (geral, diversos, interessante). Nada de sinônimos repetidos.
- kind: o tipo de capa mais adequado para o item.`,
};

/* ───────────────────────── o que mandar como contexto ───────────────────────── */

const clip = (s: string | undefined, n: number) => {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

const line = (pairs: [string, string | number | undefined][]) =>
  pairs
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

export function describeCapture(item: CaptureItem): string {
  return line([
    ["Tipo", KIND_LABELS[item.kind]],
    ["Título", item.title],
    ["Site", item.siteName],
    ["Autor", item.author],
    ["Endereço", item.url],
    ["Descrição", item.description],
    ["Lugar", item.place?.address],
    ["Preço", item.product?.price !== undefined ? `${item.product.price} ${item.product.currency ?? ""}` : undefined],
    ["Etiquetas", item.tags.join(", ")],
    [item.kind === "note" ? "Texto" : "Anotação da pessoa", item.note],
  ]);
}

export function describeCreation(c: Creation): string {
  return line([
    ["Suporte", MEDIUM_LABELS[c.medium]],
    ["Título", c.title],
    ["Arquivo", c.fileName],
    ["Ano", c.year],
    ["Notas da pessoa", c.notes],
    ["Conteúdo da pasta", c.folder?.sample.join(", ")],
  ]);
}

export interface LibraryRef {
  type: "capture" | "creation" | "project";
  id: string;
}

/**
 * Catálogo compacto do acervo, uma linha por item, com referências curtas
 * (c1, e1, p1) no lugar dos ids para economizar contexto.
 */
export function libraryCatalog(data: Pick<LibraryData, "captures" | "creations" | "projects" | "shelves" | "feeds">) {
  const refs = new Map<string, LibraryRef>();
  const out: string[] = [`Hoje: ${new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}`];
  const date = (ts: number) => new Date(ts).toLocaleDateString("pt-BR");

  out.push(`\n## Captura (referências guardadas) — ${data.captures.length}`);
  data.captures.slice(0, 1500).forEach((c, i) => {
    const ref = `c${i + 1}`;
    refs.set(ref, { type: "capture", id: c.id });
    const bits = [
      KIND_LABELS[c.kind],
      clip(c.title, 120),
      c.author && `por ${clip(c.author, 40)}`,
      c.siteName && clip(c.siteName, 40),
      c.tags.length && `#${c.tags.join(" #")}`,
      `guardado ${date(c.createdAt)}`,
      c.place?.address && clip(c.place.address, 80),
      c.note && `nota: ${clip(c.note, 200)}`,
      c.description && `desc: ${clip(c.description, 140)}`,
    ];
    out.push(`[[${ref}]] ${bits.filter(Boolean).join(" · ")}`);
  });

  const shelfName = new Map(data.shelves.map((s) => [s.id, s.name]));
  out.push(`\n## Estante (criações da própria pessoa) — ${data.creations.length}`);
  data.creations.slice(0, 800).forEach((c, i) => {
    const ref = `e${i + 1}`;
    refs.set(ref, { type: "creation", id: c.id });
    const bits = [
      MEDIUM_LABELS[c.medium],
      clip(c.title, 120),
      c.fileName,
      c.year,
      c.featured && "na vitrine",
      `estante: ${c.shelfId ? shelfName.get(c.shelfId) : "entrada"}`,
      c.notes && `notas: ${clip(c.notes, 200)}`,
    ];
    out.push(`[[${ref}]] ${bits.filter(Boolean).join(" · ")}`);
  });

  const title = new Map<string, string>([
    ...data.captures.map((c) => [c.id, c.title] as const),
    ...data.creations.map((c) => [c.id, c.title] as const),
  ]);
  out.push(`\n## Projetos (quadros) — ${data.projects.length}`);
  data.projects.forEach((p, i) => {
    const ref = `p${i + 1}`;
    refs.set(ref, { type: "project", id: p.id });
    const inside = p.nodes.map((n) => (n.refId ? title.get(n.refId) : n.text)).filter(Boolean) as string[];
    out.push(`[[${ref}]] ${clip(p.name, 80)}${p.description ? ` — ${clip(p.description, 160)}` : ""} · contém: ${clip(inside.join("; "), 400) || "vazio"}`);
  });

  if (data.feeds.length) out.push(`\n## Transmissões seguidas (RSS)\n${data.feeds.map((f) => `- ${f.title}`).join("\n")}`);

  return { text: out.join("\n"), refs };
}

/* ───────────────────────── categorização ───────────────────────── */

export const CATEGORIZE_SCHEMA = {
  type: "OBJECT",
  properties: {
    tags: { type: "ARRAY", items: { type: "STRING" } },
    kind: { type: "STRING", enum: Object.keys(KIND_LABELS) },
  },
  required: ["tags", "kind"],
};

export interface Categorization {
  tags: string[];
  kind: CaptureKind;
}

export const MAX_TAGS = 12;

/** Limpa etiquetas sugeridas: minúsculas, curtas, sem repetir as que já existem no item. */
export function cleanTags(suggested: string[], current: string[]): string[] {
  const seen = new Set(current);
  const out: string[] = [];
  for (const raw of suggested) {
    const t = raw.toLowerCase().replace(/^#/, "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 28 || t.split(" ").length > 2 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  // no máximo 12 no total, contando as que o item já tinha
  return out.slice(0, Math.max(0, MAX_TAGS - current.length));
}

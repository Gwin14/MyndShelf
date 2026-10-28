import type { CaptureItem } from "@myndshelf/types";
import { pushCaptures } from "./api";
import { buildCapture, type CaptureInput } from "./capture";
import { outbox, server } from "./settings";

export type SaveResult = { ok: true; queued: boolean; title: string } | { ok: false; error: string };

let flushing: Promise<number> | undefined;

/** Sobe o que está na fila. Devolve quantos itens ainda esperam. */
export function flush(): Promise<number> {
  flushing ??= (async () => {
    try {
      const s = await server.getValue();
      const pending = await outbox.getValue();
      if (!s || !pending.length) return pending.length;
      try {
        await pushCaptures(s, pending);
      } catch {
        return pending.length;
      }
      // o que entrou na fila enquanto subia continua lá
      const sent = new Set(pending.map((p) => p.id));
      const left = (await outbox.getValue()).filter((p) => !sent.has(p.id));
      await outbox.setValue(left);
      return left.length;
    } finally {
      flushing = undefined;
    }
  })();
  return flushing;
}

async function enqueue(item: CaptureItem) {
  await outbox.setValue([...(await outbox.getValue()), item]);
}

/** Lê, monta e sobe a captura; sem servidor ao alcance, ela espera na fila. */
export async function save(input: CaptureInput): Promise<SaveResult> {
  const s = await server.getValue();
  if (!s) return { ok: false, error: "Conecte a extensão ao seu servidor primeiro." };
  let item: CaptureItem;
  try {
    item = await buildCapture(input, s);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Não deu para ler isso." };
  }
  await enqueue(item);
  const left = await flush();
  return { ok: true, queued: left > 0, title: item.title };
}

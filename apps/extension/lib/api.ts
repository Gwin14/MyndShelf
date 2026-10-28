import { API, type Change, type PushResponse, type ServerInfo } from "@myndshelf/sync/protocol";
import type { CaptureItem } from "@myndshelf/types";
import { device, type ServerSettings } from "./settings";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

async function call(s: ServerSettings, path: string, init: RequestInit = {}, timeout = 15_000): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${s.url}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${s.token}`, ...init.headers },
      signal: AbortSignal.timeout(timeout),
    });
  } catch {
    throw new ApiError("O servidor não respondeu.");
  }
  if (res.status === 401) throw new ApiError("O servidor recusou o token.", 401);
  if (!res.ok) throw new ApiError(`O servidor respondeu com erro ${res.status}.`, res.status);
  return res;
}

/** Confere endereço e token antes de guardar os ajustes. */
export async function checkServer(s: ServerSettings): Promise<ServerInfo> {
  const info = (await (await call(s, API.info, {}, 8000)).json().catch(() => null)) as ServerInfo | null;
  if (info?.app !== "myndshelf-server") throw new ApiError("Esse endereço não é um servidor do MyndShelf.");
  await call(s, API.ping, {}, 8000);
  return info;
}

/** Sobe capturas como mudanças da sincronização: os apps recebem no próximo pull. */
export async function pushCaptures(s: ServerSettings, items: CaptureItem[]): Promise<PushResponse> {
  const now = Date.now();
  const changes: Change[] = items.map((data) => ({ collection: "captures", id: data.id, updatedAt: now, data }));
  const res = await call(s, API.push, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device: await device(), changes }),
  });
  return res.json();
}

/** HTML de uma página lido pelo servidor (o mesmo `/__og` que o site usa). */
export async function fetchHtmlViaServer(s: ServerSettings, url: string): Promise<string> {
  return (await call(s, `/__og?url=${encodeURIComponent(url)}`, {}, 12_000)).text();
}

/** Segue redirecionamentos de links curtos (mapas) pelo servidor. */
export async function resolveViaServer(s: ServerSettings, url: string): Promise<string> {
  return (await call(s, `/__resolve?url=${encodeURIComponent(url)}`, {}, 12_000)).text();
}

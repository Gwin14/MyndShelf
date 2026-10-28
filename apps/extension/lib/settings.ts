import { storage } from "#imports";
import { uid } from "@myndshelf/core";
import type { CaptureItem } from "@myndshelf/types";

export interface ServerSettings {
  /** sem barra no fim: https://homelab.tailnet.ts.net */
  url: string;
  token: string;
}

export const server = storage.defineItem<ServerSettings | null>("local:server", { fallback: null });

/** Identidade deste navegador no servidor (o `device` da sincronização). */
const deviceItem = storage.defineItem<string>("local:device", { init: () => `extension-${uid()}` });
export const device = () => deviceItem.getValue();

/** Capturas prontas que ainda não subiram (servidor fora do ar, sem conexão…). */
export const outbox = storage.defineItem<CaptureItem[]>("local:outbox", { fallback: [] });

export const cleanServerUrl = (raw: string) => {
  let url = raw.trim().replace(/\/+$/, "");
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
};

/** Padrão de permissão para o endereço do servidor (`https://host:porta/*`). */
export const originPattern = (url: string) => `${new URL(url).origin}/*`;

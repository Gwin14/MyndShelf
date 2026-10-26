import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { get, set } from "idb-keyval";
import { isTauri } from "./platform";
import { kv } from "./store";

/** As mesmas artes do celular (assets/app-icons), achatadas em public/app-icons. */
export const APP_ICONS = [
  { name: "MindShelf", label: "Mind Shelf" },
  { name: "Cosmos", label: "Cosmos" },
  { name: "Emblema", label: "Emblema" },
] as const;

export type AppIconName = (typeof APP_ICONS)[number]["name"];

const KEY = "setting:app-icon";
export const iconUrl = (name: AppIconName) => `/app-icons/${name}.png`;

/** App: Dock/Finder no macOS, janela e barra de tarefas no Windows/Linux. Site: favicon. */
async function apply(name: AppIconName) {
  if (isTauri) return invoke("set_app_icon", { name });
  for (const rel of ["icon", "apple-touch-icon"]) {
    let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.append(link);
    }
    link.type = "image/png";
    link.href = iconUrl(name);
  }
}

interface AppIconState {
  icon: AppIconName;
  setIcon(name: AppIconName): Promise<void>;
}

export const useAppIcon = create<AppIconState>((setState) => ({
  icon: "MindShelf",
  async setIcon(icon) {
    await apply(icon);
    setState({ icon });
    await set(KEY, icon, kv);
  },
}));

/** Ao abrir: o Dock do macOS só guarda o ícone trocado enquanto o app está aberto. */
export function startAppIcon() {
  void get<AppIconName>(KEY, kv).then((saved) => {
    const icon = APP_ICONS.some((i) => i.name === saved) ? saved! : "MindShelf";
    useAppIcon.setState({ icon });
    if (icon !== "MindShelf" || !isTauri) void apply(icon).catch((e) => console.warn("ícone do app", e));
  });
}

import { create } from "zustand";
import { isTauri } from "./platform";

/** Abrir com o computador, em segundo plano: só a bandeja e a pasta no Finder/Explorer. */
interface AutostartState {
  enabled: boolean;
  busy: boolean;
  error: string;
  refresh(): Promise<void>;
  set(on: boolean): Promise<void>;
}

const api = () => import("@tauri-apps/plugin-autostart");

export const useAutostart = create<AutostartState>((setState) => ({
  enabled: false,
  busy: false,
  error: "",
  async refresh() {
    if (!isTauri) return;
    try {
      setState({ enabled: await (await api()).isEnabled() });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    }
  },
  async set(on) {
    setState({ busy: true, error: "" });
    try {
      const a = await api();
      await (on ? a.enable() : a.disable());
      setState({ enabled: await a.isEnabled() });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      setState({ busy: false });
    }
  },
}));

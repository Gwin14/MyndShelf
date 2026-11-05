import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { isTauri } from "./platform";
import { sync } from "./sync";

/** A Estante no Finder / Explorer / gerenciador de arquivos (crate myndshelf-drive). */
export interface DriveStatus {
  supported: boolean;
  enabled: boolean;
  running: boolean;
  /** pasta no disco (Windows/Linux); no macOS o Finder decide */
  location: string | null;
  error: string | null;
}

const OFF: DriveStatus = { supported: false, enabled: false, running: false, location: null, error: null };

export const driveStore = create<DriveStatus & { busy: boolean }>(() => ({ ...OFF, busy: false }));

/** Como o gerenciador de arquivos se chama neste sistema. */
export const fileManagerName = /Mac/i.test(navigator.userAgent) ? "Finder" : /Win/i.test(navigator.userAgent) ? "Explorer" : "gerenciador de arquivos";

async function call(cmd: string, args?: Record<string, unknown>) {
  driveStore.setState({ busy: true });
  try {
    const s = await invoke<DriveStatus>(cmd, args);
    driveStore.setState({ ...s, busy: false });
  } catch (e) {
    driveStore.setState({ busy: false, error: e instanceof Error ? e.message : String(e) });
  }
}

export async function refreshDrive() {
  if (!isTauri) return;
  try {
    driveStore.setState(await invoke<DriveStatus>("drive_status"));
  } catch {
    driveStore.setState(OFF);
  }
}

export async function enableDrive() {
  const cfg = sync.config();
  if (!cfg) return driveStore.setState({ error: "Conecte a um servidor primeiro." });
  await call("drive_enable", { url: cfg.url, token: cfg.token });
}

export const disableDrive = () => (isTauri ? call("drive_disable") : Promise.resolve());

/** Servidor trocado ou token novo: o drive passa a usar o mesmo. */
export async function followServer() {
  if (!isTauri) return;
  await refreshDrive();
  if (!driveStore.getState().enabled) return;
  if (sync.config()) await enableDrive();
  else await disableDrive();
}

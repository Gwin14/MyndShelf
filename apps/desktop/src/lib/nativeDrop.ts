import { captureImageFile } from "./capture";
import { addDroppedPaths } from "./files";
import { onNativeDrop, pathInfo, readDroppedFile } from "./platform";
import { library } from "./store";
import { useUi } from "./ui";

/**
 * No app desktop o Tauri recebe o que é arrastado do Finder/Explorer
 * (com o caminho real, inclusive de pastas) e decide pela seção aberta.
 */
export function startNativeDrop(): () => void {
  // o listener chega de forma assíncrona: se o efeito já foi desfeito (StrictMode
  // monta, desmonta e monta de novo), removemos na hora — senão cada item entra duas vezes
  let disposed = false;
  let stop: (() => void) | undefined;
  void onNativeDrop(async (e) => {
    const ui = useUi.getState();
    if (e.type !== "drop") {
      ui.set({ nativeDrag: e.type !== "leave" });
      return;
    }
    ui.set({ nativeDrag: false });

    if (ui.section === "shelf") {
      const target = library.getState().shelves.some((s) => s.id === ui.shelfFilter) ? ui.shelfFilter : null;
      await addDroppedPaths(e.paths, target);
    } else if (ui.section === "capture") {
      for (const path of e.paths) {
        if (!/\.(png|jpe?g|gif|webp|avif|heic|bmp|svg)$/i.test(path)) continue;
        const info = await pathInfo(path);
        await captureImageFile(await readDroppedFile(path, info.name));
      }
    }
  }).then((unlisten) => {
    if (disposed) unlisten();
    else stop = unlisten;
  });
  return () => {
    disposed = true;
    stop?.();
  };
}

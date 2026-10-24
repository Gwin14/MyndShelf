import { BackupError, backupCounts, mergeLibrary, parseBackup, serializeLibrary } from "@myndshelf/core";
import type { LibraryData } from "@myndshelf/types";
import { library } from "./store";
import { toast } from "./toast";

const data = (): LibraryData => {
  const { captures, feeds, feedEntries, creations, shelves, projects } = library.getState();
  return { captures, feeds, feedEntries, creations, shelves, projects };
};

/** Acervo inteiro em JSON — o app do celular lê o mesmo arquivo. */
export function exportLibrary() {
  const blob = new Blob([serializeLibrary(data(), "desktop")], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `myndshelf-acervo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function importLibrary(file: File) {
  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch (e) {
    return toast(e instanceof BackupError ? e.message : "Não deu para ler o arquivo.");
  }
  const n = backupCounts(backup.data);
  const summary = `${n.captures} capturas, ${n.creations} criações, ${n.projects} projetos e ${n.feeds} transmissões${backup.source ? ` (do ${backup.source})` : ""}`;
  const replace = !confirm(`Importar ${summary}.\n\nOK mescla com o acervo atual. Cancelar pergunta se é para substituir tudo.`);
  if (replace && !confirm("Substituir o acervo inteiro por este arquivo? Isso não pode ser desfeito.")) return;
  library.getState().replaceLibrary(replace ? backup.data : mergeLibrary(data(), backup.data));
  toast(replace ? "Acervo substituído" : "Acervo mesclado");
}

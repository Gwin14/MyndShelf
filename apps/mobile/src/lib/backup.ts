import { Alert } from "react-native";
import { File, Paths } from "expo-file-system";
import * as DocumentPicker from "expo-document-picker";
import * as Sharing from "expo-sharing";
import { BackupError, backupCounts, mergeLibrary, parseBackup, serializeLibrary } from "@myndshelf/core";
import type { LibraryData } from "@myndshelf/types";
import { success } from "./haptics";
import { library } from "./store";
import { exclusive } from "./pickers";
import { toast } from "./toast";

const data = (): LibraryData => {
  const { captures, feeds, feedEntries, creations, shelves, projects } = library.getState();
  return { captures, feeds, feedEntries, creations, shelves, projects };
};

/** Acervo inteiro em JSON — o desktop lê o mesmo arquivo. */
export async function exportLibrary() {
  const day = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `myndshelf-acervo-${day}.json`);
  if (file.exists) file.delete();
  file.create();
  await file.write(serializeLibrary(data(), "mobile"));
  if (!(await Sharing.isAvailableAsync())) return toast("Compartilhar não está disponível aqui.");
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Exportar acervo", UTI: "public.json" });
}

export async function importLibrary() {
  const res = await exclusive(() => DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true }));
  if (!res || res.canceled) return;
  let backup;
  try {
    backup = parseBackup(await new File(res.assets[0].uri).text());
  } catch (e) {
    return toast(e instanceof BackupError ? e.message : "Não deu para ler o arquivo.");
  }
  const n = backupCounts(backup.data);
  const summary = `${n.captures} capturas, ${n.creations} criações, ${n.projects} projetos e ${n.feeds} transmissões${backup.source ? ` (vindo do ${backup.source})` : ""}.`;
  const apply = (mode: "merge" | "replace") => {
    library.getState().replaceLibrary(mode === "merge" ? mergeLibrary(data(), backup.data) : backup.data);
    success();
    toast(mode === "merge" ? "Acervo mesclado ✦" : "Acervo substituído ✦");
  };
  Alert.alert("Importar acervo", `${summary}\n\nArquivos originais da Estante não vêm junto — só as prévias.`, [
    { text: "Cancelar", style: "cancel" },
    { text: "Substituir tudo", style: "destructive", onPress: () => apply("replace") },
    { text: "Mesclar", style: "default", onPress: () => apply("merge") },
  ]);
}

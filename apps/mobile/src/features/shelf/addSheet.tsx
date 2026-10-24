import { router } from "expo-router";
import { FileUp, Images, PenLine } from "lucide-react-native";
import { pickFiles, pickMedia } from "../../lib/files";
import { openSheet } from "../../lib/sheet";
import { colors } from "../../lib/theme";

const C = colors.paperDim;

/** Arquivo, foto/vídeo ou um texto escrito na hora. */
export function addCreationSheet(shelfId: string | null) {
  openSheet(
    [
      { label: "Arquivo", hint: "PDF, áudio, código…", icon: <FileUp size={18} color={C} />, onSelect: () => void pickFiles(shelfId) },
      { label: "Foto ou vídeo", icon: <Images size={18} color={C} />, onSelect: () => void pickMedia(shelfId) },
      { label: "Escrever um manuscrito", icon: <PenLine size={18} color={C} />, onSelect: () => router.push({ pathname: "/creation/new", params: shelfId ? { shelf: shelfId } : {} }) },
    ],
    "Pôr na estante",
  );
}


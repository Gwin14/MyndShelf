import { useCallback, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Ellipsis, Maximize, Plus, StickyNote } from "lucide-react-native";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { Touch } from "../../components/Touch";
import { Board, type BoardHandle } from "../../features/projects/Board";
import { placeNode } from "../../lib/board";
import { projectMenu } from "../../lib/menus";
import { askText } from "../../lib/prompt";
import { openSheet } from "../../lib/sheet";
import { library, useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useLibrary((s) => s.projects.find((p) => p.id === id));
  const insets = useSafeAreaInsets();
  const board = useRef<BoardHandle>(null);
  const onReady = useCallback((h: BoardHandle) => (board.current = h), []);

  if (!project) return <Empty title="Este projeto não existe mais." />;

  const rename = async () => {
    const name = await askText("Nome do projeto", { initial: project.name });
    if (name) library.getState().updateProject(project.id, { name });
  };
  const addNote = async () => {
    const text = await askText("Nova nota", { placeholder: "Escreva uma ideia…", multiline: true, action: "Pôr no quadro" });
    if (text) placeNode(project.id, "text", undefined, text);
  };

  return (
    <View style={styles.root}>
      <Board key={project.id} project={project} onReady={onReady} />

      <View style={[styles.head, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Touch onPress={() => router.back()} hitSlop={10} style={styles.round} accessibilityLabel="Voltar">
          <ChevronLeft size={20} color={colors.paper} />
        </Touch>
        <Touch onPress={() => void rename()} style={styles.titleWrap}>
          <Text style={styles.kicker}>
            III — Projeto · {project.nodes.length} objetos · {project.edges.length} ligações
          </Text>
          <Text style={styles.title} numberOfLines={1}>
            {project.name}
          </Text>
        </Touch>
        <Touch onPress={() => openSheet(projectMenu(project.id, () => void rename(), true), project.name)} hitSlop={10} style={styles.round}>
          <Ellipsis size={18} color={colors.paper} />
        </Touch>
      </View>

      {!project.nodes.length && (
        <View style={styles.empty} pointerEvents="none">
          <Empty title="Um céu em branco." hint="Traga referências da Captura, criações da Estante ou escreva notas. Arraste para mover, pince para aproximar." />
        </View>
      )}

      <View style={[styles.dock, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <Button variant="flare" label="Trazer" icon={<Plus size={15} color={colors.void} />} onPress={() => router.push({ pathname: "/project/add", params: { id: project.id } })} />
        <Button label="Nota" icon={<StickyNote size={15} color={colors.paper} />} onPress={() => void addNote()} />
        <Button icon={<Maximize size={15} color={colors.paper} />} onPress={() => board.current?.fit()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10, backgroundColor: "rgba(6,5,11,0.72)", borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,230,210,0.06)", borderWidth: 1, borderColor: colors.line },
  titleWrap: { flex: 1 },
  kicker: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: colors.paperMute },
  title: { fontFamily: fonts.display, fontSize: 24, color: colors.paper },
  empty: { position: "absolute", left: 0, right: 0, top: "28%" },
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", justifyContent: "center", gap: 10 },
});

import { useCallback, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { ChevronLeft, Ellipsis, Maximize, Minus, Plus, StickyNote } from "lucide-react-native";
import { Cosmos } from "../../components/Cosmos";
import { Empty } from "../../components/Empty";
import { Touch } from "../../components/Touch";
import { Board, type BoardHandle } from "../../features/projects/Board";
import { placeNode } from "../../lib/board";
import { projectMenu } from "../../lib/menus";
import { EASE, SLOW } from "../../lib/motion";
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
      {/* fundo próprio e opaco: a lista de projetos não vaza por trás durante a transição */}
      <Cosmos />
      <Board key={project.id} project={project} onReady={onReady} />

      <LinearGradient colors={["rgba(6,5,11,0.92)", "rgba(6,5,11,0.6)", "rgba(6,5,11,0)"]} style={[styles.headFade, { height: insets.top + 120 }]} pointerEvents="none" />
      <Animated.View entering={FadeIn.duration(SLOW).easing(EASE)} style={[styles.head, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
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
      </Animated.View>

      {!project.nodes.length && (
        <View style={styles.empty} pointerEvents="none">
          <Empty title="Um céu em branco." hint="Traga referências da Captura, criações da Estante ou escreva notas. Arraste para mover, pince para aproximar." />
        </View>
      )}

      <Animated.View entering={FadeInDown.duration(SLOW).easing(EASE)} style={[styles.dock, { bottom: insets.bottom + 14 }]}>
        <Tool onPress={() => board.current?.zoomBy(1 / 1.25)}>
          <Minus size={17} color={colors.paperDim} />
        </Tool>
        <Tool onPress={() => board.current?.zoomBy(1.25)}>
          <Plus size={17} color={colors.paperDim} />
        </Tool>
        <Tool onPress={() => board.current?.fit()}>
          <Maximize size={16} color={colors.paperDim} />
        </Tool>
        <View style={styles.sep} />
        <Touch style={styles.pill} onPress={() => void addNote()}>
          <StickyNote size={15} color={colors.paper} />
          <Text style={styles.pillText}>Nota</Text>
        </Touch>
        <Touch style={[styles.pill, styles.pillFlare]} onPress={() => router.push({ pathname: "/project/add", params: { id: project.id } })}>
          <Plus size={15} color={colors.void} />
          <Text style={[styles.pillText, { color: colors.void, fontFamily: fonts.bodyBold }]}>Trazer</Text>
        </Touch>
      </Animated.View>
    </View>
  );
}

function Tool({ onPress, children }: { onPress(): void; children: React.ReactNode }) {
  return (
    <Touch onPress={onPress} hitSlop={4} style={styles.tool}>
      {children}
    </Touch>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  headFade: { position: "absolute", left: 0, right: 0, top: 0 },
  head: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,10,21,0.7)", borderWidth: 1, borderColor: colors.line },
  titleWrap: { flex: 1 },
  kicker: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase", color: colors.paperMute },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6, color: colors.paper, textShadowColor: colors.void, textShadowRadius: 20 },
  empty: { position: "absolute", left: 0, right: 0, top: "26%" },
  dock: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    padding: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(12,10,21,0.88)",
    shadowColor: "#000",
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
  },
  tool: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  sep: { width: 1, height: 18, marginHorizontal: 4, backgroundColor: colors.lineStrong },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999 },
  pillFlare: { backgroundColor: colors.amber, marginLeft: 2 },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.paper },
});

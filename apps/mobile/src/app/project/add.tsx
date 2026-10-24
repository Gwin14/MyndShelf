import { useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { Field } from "../../components/Field";
import { ModalScreen } from "../../components/ModalScreen";
import { Segmented } from "../../components/Segmented";
import { Touch } from "../../components/Touch";
import { Cover } from "../../features/capture/covers/Cover";
import { ShelfObject } from "../../features/shelf/ShelfObject";
import { placeNode } from "../../lib/board";
import { success } from "../../lib/haptics";
import { useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";

/** Trazer para o quadro: referências da Captura ou criações da Estante, com busca. */
export default function AddToBoard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const project = useLibrary((s) => s.projects.find((p) => p.id === id));
  const captures = useLibrary((s) => s.captures);
  const creations = useLibrary((s) => s.creations);
  const [tab, setTab] = useState<"capture" | "creation">("capture");
  const [q, setQ] = useState("");
  const { width } = useWindowDimensions();
  const cols = width >= 700 ? 4 : 3;
  const cell = (Math.min(width, 720) - 32 - (cols - 1) * 10) / cols;
  const onBoard = new Set(project?.nodes.map((n) => n.refId));

  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = tab === "capture" ? captures : creations;
    return list.filter((c) => !s || [c.title, ...("tags" in c ? c.tags : [])].some((t) => t?.toLowerCase().includes(s))).slice(0, 120);
  }, [tab, q, captures, creations]);

  if (!project) return <ModalScreen kicker="Projeto">{null}</ModalScreen>;

  return (
    <ModalScreen kicker={`Trazer para “${project.name}”`}>
      <View style={styles.top}>
        <Segmented value={tab} onChange={setTab} options={[{ id: "capture", label: "Captura" }, { id: "creation", label: "Estante" }]} />
      </View>
      <Field value={q} onChangeText={setQ} placeholder="Buscar…" autoCapitalize="none" />
      <View style={[styles.grid, { gap: 10 }]}>
        {items.map((c) => {
          const added = onBoard.has(c.id);
          return (
            <Touch
              key={c.id}
              style={[styles.cell, { width: cell }, added && styles.added]}
              onPress={() => {
                success();
                placeNode(project.id, tab, c.id);
              }}
            >
              <View style={[styles.thumb, { height: cell * 1.1 }]} pointerEvents="none">
                {tab === "capture" ? (
                  <Cover item={c as never} width={cell - 12} />
                ) : (
                  <View style={{ transform: [{ scale: Math.min(0.7, cell / 220) }] }}>
                    <ShelfObject item={c as never} />
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={2}>
                {c.title}
              </Text>
              {added && (
                <View style={styles.badge}>
                  <Check size={12} color={colors.void} />
                </View>
              )}
            </Touch>
          );
        })}
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  top: { marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  cell: { padding: 6, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(239,230,210,0.03)" },
  added: { borderColor: "rgba(255,180,61,0.6)" },
  thumb: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  name: { fontFamily: fonts.display, fontSize: 13, lineHeight: 14, color: colors.paper, marginTop: 6 },
  badge: { position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.amber },
});

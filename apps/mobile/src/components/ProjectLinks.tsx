import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Orbit, Plus } from "lucide-react-native";
import { placeNode } from "../lib/board";
import { success } from "../lib/haptics";
import { library, useLibrary } from "../lib/store";
import { colors, fonts, hsl } from "../lib/theme";
import { toast } from "../lib/toast";
import { Touch } from "./Touch";

/** Em quais quadros o item está, e um toque para pô-lo em outro. */
export function ProjectLinks({ kind, refId }: { kind: "capture" | "creation"; refId: string }) {
  const projects = useLibrary((s) => s.projects);
  const inside = projects.filter((p) => p.nodes.some((n) => n.refId === refId));
  const others = projects.filter((p) => !inside.includes(p)).slice(0, 8);
  return (
    <View style={styles.wrap}>
      {inside.map((p) => (
        <Touch key={p.id} style={[styles.pill, styles.on, { borderColor: hsl(p.hue, 70, 60, 0.6) }]} onPress={() => router.push(`/project/${p.id}`)}>
          <Orbit size={13} color={hsl(p.hue, 80, 70)} />
          <Text style={styles.text}>{p.name}</Text>
        </Touch>
      ))}
      {others.map((p) => (
        <Touch
          key={p.id}
          style={styles.pill}
          onPress={() => {
            success();
            placeNode(p.id, kind, refId);
            toast(`Adicionado a “${p.name}”`, { label: "Abrir", run: () => router.push(`/project/${p.id}`) });
          }}
        >
          <Plus size={13} color={colors.paperMute} />
          <Text style={[styles.text, styles.dim]}>{p.name}</Text>
        </Touch>
      ))}
      <Touch
        style={[styles.pill, styles.dashed]}
        onPress={() => {
          const id = library.getState().createProject("Novo projeto");
          placeNode(id, kind, refId);
          router.push(`/project/${id}`);
        }}
      >
        <Plus size={13} color={colors.amber} />
        <Text style={[styles.text, { color: colors.amber }]}>Novo projeto</Text>
      </Touch>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.line },
  on: { backgroundColor: "rgba(239,230,210,0.06)" },
  dashed: { borderStyle: "dashed", borderColor: "rgba(255,180,61,0.4)" },
  text: { fontFamily: fonts.body, fontSize: 13.5, color: colors.paper },
  dim: { color: colors.paperDim },
});

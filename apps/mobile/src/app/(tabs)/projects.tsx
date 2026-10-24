import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Circle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from "react-native-svg";
import { Plus } from "lucide-react-native";
import { relativeDate } from "@myndshelf/core";
import type { Project } from "@myndshelf/types";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { Headline } from "../../components/Headline";
import { TopBar } from "../../components/TopBar";
import { Touch } from "../../components/Touch";
import { GUTTER, useColumns } from "../../lib/layout";
import { projectMenu } from "../../lib/menus";
import { askText } from "../../lib/prompt";
import { openSheet } from "../../lib/sheet";
import { library, useLibrary } from "../../lib/store";
import { colors, fonts, hsl } from "../../lib/theme";

const create = async () => {
  const name = await askText("Novo projeto", { placeholder: "Um nome para a constelação", action: "Criar" });
  if (name) router.push(`/project/${library.getState().createProject(name)}`);
};

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const projects = useLibrary((s) => s.projects);
  const { columns, colWidth } = useColumns(300, 14);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.pad, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 120 }]}>
      <TopBar />
      <Headline kicker={`III — Projetos · ${projects.length} constelações`} before="Onde as coisas" em="se" after="encontram." />
      {projects.length > 0 && <Button variant="flare" label="Novo projeto" icon={<Plus size={15} color={colors.void} />} onPress={() => void create()} style={{ marginBottom: 18 }} />}

      {projects.length ? (
        <View style={styles.grid}>
          {projects.map((p, i) => (
            <Animated.View key={p.id} entering={FadeInDown.delay(i * 50)} style={{ width: columns > 1 ? colWidth : "100%" }}>
              <Touch
                style={styles.card}
                onPress={() => router.push(`/project/${p.id}`)}
                onLongPress={() =>
                  openSheet(
                    projectMenu(p.id, async () => {
                      const name = await askText("Renomear projeto", { initial: p.name });
                      if (name) library.getState().updateProject(p.id, { name });
                    }),
                    p.name,
                  )
                }
              >
                <ConstellationMap project={p} />
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.meta}>
                    {p.nodes.length} objetos · {relativeDate(p.updatedAt)}
                  </Text>
                </View>
              </Touch>
            </Animated.View>
          ))}
        </View>
      ) : (
        <View>
          <Empty title="Nenhuma constelação ainda." hint="Um projeto junta referências e criações num quadro livre, com ligações entre elas." />
          <Button variant="flare" label="Criar o primeiro" icon={<Plus size={15} color={colors.void} />} style={{ alignSelf: "center" }} onPress={() => void create()} />
        </View>
      )}
    </ScrollView>
  );
}

/** O quadro reduzido a um mapa estelar: nós viram estrelas, ligações viram traços. */
function ConstellationMap({ project }: { project: Project }) {
  const W = 300;
  const H = 150;
  const pts = project.nodes.map((n) => ({ id: n.id, x: n.x + n.w / 2, y: n.y + 100 }));
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const k = Math.min((W - 60) / (maxX - minX || 1), (H - 50) / (maxY - minY || 1), 0.4);
  const map = new Map(pts.map((p) => [p.id, { x: W / 2 + (p.x - (minX + maxX) / 2) * k, y: H / 2 + (p.y - (minY + maxY) / 2) * k }]));
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <RadialGradient id="glow" cx="50%" cy="0%" rx="80%" ry="90%">
          <Stop offset="0" stopColor={hsl(project.hue, 70, 50)} stopOpacity="0.16" />
          <Stop offset="0.7" stopColor={hsl(project.hue, 70, 50)} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width={W} height={H} fill="url(#glow)" />
      {project.edges.map((e) => {
        const a = map.get(e.from);
        const b = map.get(e.to);
        return a && b ? <Line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,220,160,0.7)" strokeWidth={1.2} strokeDasharray="3 3" /> : null;
      })}
      {[...map.entries()].map(([id, p], i) => (
        <G key={id} x={p.x} y={p.y}>
          <Circle r={9} fill={hsl(project.hue, 90, 70, 0.12)} />
          <Circle r={i % 3 === 0 ? 3.2 : 2.2} fill={colors.sun} />
        </G>
      ))}
      {!pts.length && (
        <SvgText x={W / 2} y={H / 2} textAnchor="middle" fill={colors.paperMute} fontFamily={fonts.displayItalic} fontSize={18}>
          céu vazio
        </SvgText>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER, maxWidth: 1400, width: "100%", alignSelf: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden", backgroundColor: "rgba(12,10,21,0.6)" },
  info: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 16, gap: 4, borderTopWidth: 1, borderTopColor: colors.line },
  name: { fontFamily: fonts.display, fontSize: 24, color: colors.paper },
  meta: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", color: colors.paperMute },
});

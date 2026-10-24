import { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown, FadeInRight } from "react-native-reanimated";
import { Plus } from "lucide-react-native";
import { MEDIUM_LABELS } from "@myndshelf/core";
import type { Creation, CreationMedium } from "@myndshelf/types";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Empty } from "../../components/Empty";
import { Headline } from "../../components/Headline";
import { Segmented } from "../../components/Segmented";
import { TopBar } from "../../components/TopBar";
import { Touch } from "../../components/Touch";
import { ShelfObject } from "../../features/shelf/ShelfObject";
import { addCreationSheet } from "../../features/shelf/addSheet";
import { GUTTER, useColumns } from "../../lib/layout";
import { creationMenu, shelfMenu } from "../../lib/menus";
import { askText } from "../../lib/prompt";
import { openSheet } from "../../lib/sheet";
import { library, useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";
import { useUi } from "../../lib/ui";

const open = (c: Creation) => router.push(`/creation/${c.id}`);
const menu = (c: Creation) => openSheet(creationMenu(c), c.title);

export default function ShelfScreen() {
  const insets = useSafeAreaInsets();
  const creations = useLibrary((s) => s.creations);
  const shelves = useLibrary((s) => s.shelves);
  const { shelfView, shelfFilter, shelfMedium, set } = useUi();
  const { columns, colWidth } = useColumns(160, 16);

  const visible = useMemo(
    () =>
      creations.filter(
        (c) =>
          (shelfMedium === "all" || c.medium === shelfMedium) &&
          (shelfFilter === "all" || (shelfFilter === "featured" && c.featured) || (shelfFilter === "loose" && !c.shelfId) || c.shelfId === shelfFilter),
      ),
    [creations, shelfFilter, shelfMedium],
  );

  // agrupa por estante física; itens soltos ficam na "Prateleira de entrada"
  const rows = useMemo(() => {
    const out: { id: string; name: string; items: Creation[] }[] = [];
    const loose = visible.filter((c) => !c.shelfId || !shelves.some((s) => s.id === c.shelfId));
    for (const s of shelves) {
      const items = visible.filter((c) => c.shelfId === s.id);
      if (items.length) out.push({ id: s.id, name: s.name, items });
    }
    if (loose.length) out.unshift({ id: "loose", name: "Prateleira de entrada", items: loose });
    return out;
  }, [visible, shelves]);

  const media = useMemo(() => [...new Set(creations.map((c) => c.medium))] as CreationMedium[], [creations]);
  const featured = shelfFilter === "all" ? visible.filter((c) => c.featured).slice(0, 8) : [];
  const target = shelfFilter !== "all" && shelfFilter !== "featured" && shelfFilter !== "loose" ? shelfFilter : null;

  const newShelf = async () => {
    const name = await askText("Nova estante", { placeholder: "Ilustrações, demos, escritos…", action: "Criar" });
    if (name) set({ shelfFilter: library.getState().addShelf(name) });
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={[styles.pad, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 120 }]}>
      <TopBar />
      <Headline kicker={`II — Estante · ${visible.length} ${visible.length === 1 ? "criação" : "criações"}`} before="O que você" em="fez" after="existir." />

      <View style={styles.controls}>
        <Segmented value={shelfView} onChange={(shelfView) => set({ shelfView })} options={[{ id: "shelf", label: "Estante" }, { id: "gallery", label: "Galeria" }]} />
        <Button small variant="flare" label="Adicionar" icon={<Plus size={14} color={colors.void} />} onPress={() => addCreationSheet(target)} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
        <Chip label="Todas" active={shelfFilter === "all"} onPress={() => set({ shelfFilter: "all" })} />
        <Chip label="✦ Vitrine" active={shelfFilter === "featured"} onPress={() => set({ shelfFilter: "featured" })} />
        <Chip label="Entrada" active={shelfFilter === "loose"} onPress={() => set({ shelfFilter: "loose" })} />
        {shelves.map((s) => (
          <Chip
            key={s.id}
            label={s.name}
            count={creations.filter((c) => c.shelfId === s.id).length}
            active={shelfFilter === s.id}
            onPress={() => set({ shelfFilter: s.id })}
            onLongPress={() =>
              openSheet(
                shelfMenu(s, async () => {
                  const name = await askText("Renomear estante", { initial: s.name });
                  if (name) library.getState().renameShelf(s.id, name);
                }),
                s.name,
              )
            }
          />
        ))}
        <Chip label="Nova estante" icon={<Plus size={14} color={colors.amber} />} onPress={() => void newShelf()} />
      </ScrollView>
      {media.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chips} contentContainerStyle={styles.chipsContent}>
          <Chip label="Todos os suportes" active={shelfMedium === "all"} onPress={() => set({ shelfMedium: "all" })} />
          {media.map((m) => (
            <Chip key={m} label={MEDIUM_LABELS[m]} active={shelfMedium === m} onPress={() => set({ shelfMedium: shelfMedium === m ? "all" : m })} />
          ))}
        </ScrollView>
      )}

      {!visible.length && (
        <View>
          <Empty title="Uma estante esperando suas coisas." hint="Ilustrações, faixas, PDFs, vídeos, textos — tudo ganha corpo aqui." />
          <Button variant="flare" label="Adicionar criações" icon={<Plus size={15} color={colors.void} />} style={{ alignSelf: "center" }} onPress={() => addCreationSheet(target)} />
        </View>
      )}

      {shelfView === "shelf" && featured.length > 0 && (
        <View style={styles.vitrine}>
          <LinearGradient colors={["rgba(170,220,255,0.22)", "rgba(42,75,255,0.04)", "transparent"]} style={styles.beam} pointerEvents="none" />
          <Text style={styles.vitrineKicker}>✦ Vitrine</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vitrineItems}>
            {featured.map((c) => (
              <Touch key={c.id} style={styles.vitrineItem} onPress={() => open(c)} onLongPress={() => menu(c)}>
                <View style={styles.vitrineGlow}>
                  <ShelfObject item={c} />
                </View>
                <View style={styles.placard}>
                  <Text style={styles.placardTitle} numberOfLines={1}>
                    {c.title}
                  </Text>
                  {c.year ? <Text style={styles.placardYear}>{c.year}</Text> : null}
                </View>
              </Touch>
            ))}
          </ScrollView>
          <LinearGradient colors={["rgba(111,214,255,0.14)", "transparent"]} style={styles.vitrineFloor} />
        </View>
      )}

      {shelfView === "shelf" &&
        rows.map((row, r) => (
          <Animated.View key={row.id} entering={FadeInDown.delay(r * 80)} style={styles.row}>
            <View style={styles.plaque}>
              <Text style={styles.plaqueName}>{row.name}</Text>
              <Text style={styles.plaqueCount}>{row.items.length}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.items} contentContainerStyle={styles.itemsContent}>
              {row.items.map((c, i) => (
                <Animated.View key={c.id} entering={FadeInRight.delay(Math.min(i, 8) * 40)}>
                  <Touch onPress={() => open(c)} onLongPress={() => menu(c)} style={[styles.item, { transform: [{ rotate: `${((c.hue % 7) - 3) * 0.6}deg` }] }]}>
                    <ShelfObject item={c} />
                  </Touch>
                </Animated.View>
              ))}
            </ScrollView>
            <LinearGradient colors={["#efe6d2", "#b9ad94", "#2a2433", "#14111d"]} locations={[0, 0.2, 0.3, 1]} style={styles.plank} />
          </Animated.View>
        ))}

      {shelfView === "gallery" && visible.length > 0 && (
        <View style={[styles.gallery, { gap: 16 }]}>
          {visible.map((c, i) => (
            <Animated.View key={c.id} entering={FadeInDown.delay(Math.min(i, 12) * 30)} style={{ width: colWidth }}>
              <Touch onPress={() => open(c)} onLongPress={() => menu(c)} scale={0.97}>
                <View style={[styles.wall, { height: colWidth * 1.15 }]}>
                  <View style={{ transform: [{ scale: Math.min(1, colWidth / 200) }] }}>
                    <ShelfObject item={c} />
                  </View>
                </View>
                <View style={styles.wallLabel}>
                  <Text style={styles.wallTitle} numberOfLines={2}>
                    {c.title}
                  </Text>
                  <Text style={styles.wallMeta}>
                    {MEDIUM_LABELS[c.medium]}
                    {c.year ? `, ${c.year}` : ""}
                  </Text>
                </View>
              </Touch>
            </Animated.View>
          ))}
          {/* completa a última linha para a grade não esticar */}
          {Array.from({ length: (columns - (visible.length % columns)) % columns }, (_, i) => (
            <View key={`pad${i}`} style={{ width: colWidth }} />
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER, maxWidth: 1400, width: "100%", alignSelf: "center" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  chips: { marginHorizontal: -GUTTER, marginBottom: 10, flexGrow: 0 },
  chipsContent: { gap: 8, paddingHorizontal: GUTTER },

  vitrine: { marginTop: 10, marginBottom: 30, paddingTop: 40, borderRadius: 18, overflow: "hidden", backgroundColor: "rgba(111,214,255,0.04)" },
  beam: { position: "absolute", top: 0, left: "15%", right: "15%", height: "100%" },
  vitrineKicker: { position: "absolute", top: 14, left: 18, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase", color: colors.amber },
  vitrineItems: { alignItems: "flex-end", gap: 34, paddingHorizontal: 24 },
  vitrineItem: { alignItems: "center", gap: 14 },
  vitrineGlow: { shadowColor: colors.cyan, shadowOpacity: 0.3, shadowRadius: 26, shadowOffset: { width: 0, height: 0 } },
  placard: { alignItems: "center", maxWidth: 180, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 2, backgroundColor: "#ece2cb" },
  placardTitle: { fontFamily: fonts.displayItalic, fontSize: 15, color: "#1c1915" },
  placardYear: { fontFamily: fonts.mono, fontSize: 8, color: "#6e6352" },
  vitrineFloor: { height: 26, marginTop: 16, borderTopWidth: 1, borderTopColor: "rgba(111,214,255,0.4)" },

  row: { marginBottom: 36 },
  plaque: { flexDirection: "row", alignItems: "baseline", gap: 10, marginBottom: 4 },
  plaqueName: { fontFamily: fonts.displayItalic, fontSize: 22, color: colors.paper },
  plaqueCount: { fontFamily: fonts.mono, fontSize: 10, color: colors.paperMute },
  items: { marginHorizontal: -GUTTER, flexGrow: 0 },
  itemsContent: { alignItems: "flex-end", gap: 22, paddingHorizontal: GUTTER + 10, paddingTop: 30, minHeight: 200 },
  item: { transformOrigin: "50% 100%" },
  plank: { height: 10, borderRadius: 2, shadowColor: colors.cyan, shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, borderTopWidth: 1, borderTopColor: "rgba(111,214,255,0.7)" },

  gallery: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 8 },
  wall: { alignItems: "center", justifyContent: "center", borderRadius: 4, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(239,230,210,0.03)", overflow: "hidden" },
  wallLabel: { marginTop: 10, marginBottom: 6, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.amber, gap: 2 },
  wallTitle: { fontFamily: fonts.displayItalic, fontSize: 17, color: colors.paper },
  wallMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.paperMute },
});

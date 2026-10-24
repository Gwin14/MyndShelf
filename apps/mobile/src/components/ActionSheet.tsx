import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useSheet, type SheetEntry } from "../lib/sheet";
import { tap } from "../lib/haptics";
import { colors, fonts } from "../lib/theme";

export function ActionSheetHost() {
  const sheet = useSheet((s) => s.sheet);
  const close = useSheet((s) => s.close);
  const insets = useSafeAreaInsets();
  const [stack, setStack] = useState<{ label: string; entries: SheetEntry[] }[]>([]);
  useEffect(() => setStack([]), [sheet]);
  if (!sheet) return null;
  const level = stack[stack.length - 1];
  const entries = level?.entries ?? sheet.entries;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
      <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(160)} style={StyleSheet.absoluteFill}>
        <Pressable style={styles.backdrop} onPress={close} />
      </Animated.View>
      <View style={styles.dock} pointerEvents="box-none">
        <Animated.View entering={SlideInDown.springify().damping(20).stiffness(220)} exiting={SlideOutDown.duration(180)} style={[styles.panel, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.grip} />
          {level ? (
            <Pressable style={styles.back} onPress={() => setStack((s) => s.slice(0, -1))} hitSlop={8}>
              <ChevronLeft size={16} color={colors.paperDim} />
              <Text style={styles.title}>{level.label}</Text>
            </Pressable>
          ) : sheet.title ? (
            <View style={styles.head}>
              <Text style={styles.title} numberOfLines={2}>
                {sheet.title}
              </Text>
              {sheet.subtitle ? <Text style={styles.subtitle}>{sheet.subtitle}</Text> : null}
            </View>
          ) : null}
          <ScrollView style={styles.list} bounces={false}>
            {entries.map((e, i) => (
              <Pressable
                key={`${e.label}${i}`}
                style={({ pressed }) => [styles.item, pressed && styles.pressed]}
                onPress={() => {
                  tap();
                  if (e.children) return setStack((s) => [...s, { label: e.label, entries: e.children! }]);
                  close();
                  // deixa a folha sair antes de abrir outra tela/folha
                  setTimeout(() => e.onSelect?.(), 60);
                }}
              >
                <View style={styles.icon}>{e.icon}</View>
                <Text style={[styles.label, e.danger && styles.danger]} numberOfLines={1}>
                  {e.label}
                </Text>
                {e.hint ? <Text style={styles.hint}>{e.hint}</Text> : null}
                {e.children ? <ChevronRight size={16} color={colors.paperMute} /> : null}
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(6, 5, 11, 0.6)" },
  dock: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  panel: {
    width: "100%",
    maxWidth: 560,
    maxHeight: "80%",
    paddingTop: 8,
    paddingHorizontal: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(15, 13, 28, 0.99)",
  },
  grip: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: 8 },
  head: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line, marginBottom: 4 },
  back: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 10 },
  title: { fontFamily: fonts.display, fontSize: 22, color: colors.paper },
  subtitle: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.paperMute, marginTop: 2 },
  list: { flexGrow: 0 },
  item: { flexDirection: "row", alignItems: "center", gap: 12, height: 50, paddingHorizontal: 12, borderRadius: 14 },
  pressed: { backgroundColor: "rgba(239, 230, 210, 0.07)" },
  icon: { width: 20, alignItems: "center" },
  label: { flex: 1, fontFamily: fonts.body, fontSize: 16, color: colors.paper },
  danger: { color: colors.ember },
  hint: { fontFamily: fonts.mono, fontSize: 10, color: colors.paperMute, textTransform: "uppercase" },
});

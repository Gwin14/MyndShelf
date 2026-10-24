import { useEffect, useState, type ComponentProps } from "react";
import type { Tabs } from "expo-router/js-tabs";
import { StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCosmos } from "../lib/cosmos";
import { tap } from "../lib/haptics";
import { colors, fonts } from "../lib/theme";
import { Flare } from "./Flare";
import { Touch } from "./Touch";

const NAV: Record<string, { numeral: string; label: string }> = {
  index: { numeral: "I", label: "Captura" },
  shelf: { numeral: "II", label: "Estante" },
  projects: { numeral: "III", label: "Projetos" },
};

// as props que o Tabs do expo-router entrega à barra (state, emitter, navigateToTab…)
type Props = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** A navegação do desktop virou uma pílula flutuante no polegar: numerais romanos e a labareda que desliza. */
export function TabBar({ state, emitter, navigateToTab }: Props) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const slot = width / state.routes.length;
  const x = useSharedValue(0);
  const setShift = useCosmos((s) => s.setShift);

  useEffect(() => {
    x.value = withSpring(state.index * slot, { damping: 16, stiffness: 180, mass: 0.9 });
    setShift(state.index - 1);
  }, [state.index, slot, x, setShift]);

  const pill = useAnimatedStyle(() => ({ width: slot, transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.dock, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.inner} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <Animated.View style={[styles.pill, pill]}>
              <View style={styles.pillFill} />
              <Flare style={styles.pillFlare} />
            </Animated.View>
          )}
          {state.routes.map((route, i) => {
            const nav = NAV[route.name];
            if (!nav) return null;
            const active = state.index === i;
            return (
              <Touch
                key={route.key}
                style={styles.item}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={nav.label}
                onPress={() => {
                  const e = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!active && !e.defaultPrevented) {
                    tap();
                    navigateToTab(route.key);
                  }
                }}
              >
                <Text style={[styles.numeral, active && styles.activeText]}>{nav.numeral}</Text>
                <Text style={[styles.label, active && styles.activeText]}>{nav.label}</Text>
              </Touch>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingHorizontal: 16 },
  bar: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(12, 10, 21, 0.72)",
  },
  inner: { flexDirection: "row", padding: 5 },
  pill: { position: "absolute", top: 5, left: 5, bottom: 5 },
  pillFill: { flex: 1, borderRadius: 999, backgroundColor: "rgba(239, 230, 210, 0.08)", borderWidth: 1, borderColor: "rgba(239, 230, 210, 0.14)" },
  pillFlare: {
    position: "absolute",
    left: "22%",
    right: "22%",
    bottom: 3,
    height: 2,
    borderRadius: 2,
    shadowColor: colors.amber,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  item: { flex: 1, height: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  numeral: { fontFamily: fonts.displayItalic, fontSize: 14, color: colors.paperMute, opacity: 0.8 },
  label: { fontFamily: fonts.display, fontSize: 19, color: colors.paperMute },
  activeText: { color: colors.paper },
});

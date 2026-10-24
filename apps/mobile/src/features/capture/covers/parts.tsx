import { useEffect } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";

export const PAPER = "#ece2cb";
export const INK = "#1c1915";

/** Sombra funda das capas: o objeto descola do céu. */
export const drop = {
  shadowColor: "#000",
  shadowOpacity: 0.75,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 14 },
  elevation: 10,
} as const;

/** Brilho de vitrine por cima de capas brilhantes. */
export function Sheen({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)", "rgba(255,255,255,0)", "rgba(255,255,255,0.08)"]}
      locations={[0, 0.32, 0.7, 1]}
      start={{ x: 0, y: 0.1 }}
      end={{ x: 1, y: 0.9 }}
      style={[StyleSheet.absoluteFill, style]}
    />
  );
}

/** Giro contínuo (disco, órbita do carregando). */
export function useSpin(ms: number, running = true) {
  const r = useSharedValue(0);
  useEffect(() => {
    if (!running) return;
    r.value = 0;
    r.value = withRepeat(withTiming(360, { duration: ms, easing: Easing.linear }), -1);
  }, [ms, running, r]);
  return useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
}

/** Anel que se expande e some — ondas do podcast e o pino do mapa. */
export function Pulse({ delay = 0, ms = 3600, to = 1.9, style }: { delay?: number; ms?: number; to?: number; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration: ms, easing: Easing.bezier(0.22, 1, 0.36, 1) }), -1));
  }, [delay, ms, t]);
  const anim = useAnimatedStyle(() => ({ opacity: 1 - t.value, transform: [{ scale: 1 + (to - 1) * t.value }] }));
  return <Animated.View pointerEvents="none" style={[style, anim]} />;
}

/** Cursor piscando do terminal. */
export function Blink({ style }: { style?: StyleProp<ViewStyle> }) {
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0, { duration: 500, easing: Easing.steps(1) }), -1, true);
  }, [o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[style, anim]} />;
}

/** Repete uma View n vezes — para listras, furos de película, ranhuras. */
export function Repeat({ n, render }: { n: number; render: (i: number) => React.ReactNode }) {
  return <>{Array.from({ length: n }, (_, i) => render(i))}</>;
}


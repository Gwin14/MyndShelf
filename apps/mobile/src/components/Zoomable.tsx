import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { GestureDetector, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture, useExclusiveGestures } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { smooth } from "../lib/motion";

/** Pinça para aproximar, arrastar para passear, toque duplo para alternar 1× ↔ 2,5×. */
export function Zoomable({ children, width, height }: { children: ReactNode; width: number; height: number }) {
  const scale = useSharedValue(1);
  const base = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const clamp = (v: number, s: number, size: number) => {
    "worklet";
    const max = ((s - 1) * size) / 2;
    return Math.min(max, Math.max(-max, v));
  };

  const pinch = usePinchGesture({
    onActivate: () => {
      base.value = scale.value;
    },
    onUpdate: (e) => {
      scale.value = Math.min(5, Math.max(0.9, base.value * e.scale));
    },
    onDeactivate: () => {
      if (scale.value < 1) {
        scale.value = smooth(1);
        x.value = smooth(0);
        y.value = smooth(0);
      }
    },
  });

  const pan = usePanGesture({
    minPointers: 1,
    onActivate: () => {
      startX.value = x.value;
      startY.value = y.value;
    },
    onUpdate: (e) => {
      x.value = clamp(startX.value + e.translationX, scale.value, width);
      y.value = clamp(startY.value + e.translationY, scale.value, height);
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      if (e.canceled) return;
      const next = scale.value > 1.2 ? 1 : 2.5;
      scale.value = smooth(next);
      if (next === 1) {
        x.value = smooth(0);
        y.value = smooth(0);
      }
    },
  });

  const gesture = useExclusiveGestures(doubleTap, useSimultaneousGestures(pinch, pan));
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.fill, { width, height }, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({ fill: { alignItems: "center", justifyContent: "center" } });

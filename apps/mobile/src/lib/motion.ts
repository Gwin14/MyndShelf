import { Easing, withTiming } from "react-native-reanimated";
import { motion } from "@myndshelf/design-tokens";

/** A curva do desktop (--ease): desacelera até parar, sem passar do ponto nem quicar. */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
export const FAST = motion.fast;
export const BASE = motion.base;
export const SLOW = motion.slow;

/** Transição suave para valores animados (no lugar das molas). */
export const smooth = (value: number, duration: number = BASE) => {
  "worklet";
  return withTiming(value, { duration, easing: EASE });
};

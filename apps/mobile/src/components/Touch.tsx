import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { BASE, FAST, smooth } from "../lib/motion";

const APressable = Animated.createAnimatedComponent(Pressable);

/** Pressable que afunda um pouco ao toque, com a mola do desktop. */
export function Touch({
  style,
  children,
  scale = 0.96,
  ...props
}: Omit<PressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; children?: ReactNode; scale?: number }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <APressable
      {...props}
      onPressIn={(e) => {
        s.value = smooth(scale, FAST);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = smooth(1, BASE);
        props.onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}

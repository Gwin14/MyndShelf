import type { ReactNode } from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

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
        s.value = withSpring(scale, { damping: 18, stiffness: 400 });
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        s.value = withSpring(1, { damping: 12, stiffness: 300 });
        props.onPressOut?.(e);
      }}
      style={[style, anim]}
    >
      {children}
    </APressable>
  );
}

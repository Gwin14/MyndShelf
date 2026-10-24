import { useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageContentFit } from "expo-image";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { hsl } from "../lib/theme";

/** Fundo tingido pela matiz do item — o que aparece quando não há imagem. */
export function HueFallback({ hue, style }: { hue: number; style?: StyleProp<ViewStyle> }) {
  const id = `h${hue}`;
  return (
    <View style={[{ backgroundColor: hsl(hue, 55, 32), overflow: "hidden" }, style]}>
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id={`${id}a`} cx="30%" cy="30%" rx="70%" ry="60%">
            <Stop offset="0" stopColor={hsl(hue + 40, 80, 60)} stopOpacity="1" />
            <Stop offset="1" stopColor={hsl(hue + 40, 80, 60)} stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`${id}b`} cx="80%" cy="90%" rx="80%" ry="80%">
            <Stop offset="0" stopColor={hsl(hue - 50, 70, 45)} stopOpacity="1" />
            <Stop offset="1" stopColor={hsl(hue - 50, 70, 45)} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill={`url(#${id}b)`} />
        <Rect width="100" height="100" fill={`url(#${id}a)`} />
      </Svg>
    </View>
  );
}

/** Imagem remota com fallback tingido pela matiz do item. */
export function Art({ src, hue, style, fit = "cover", position }: { src?: string; hue: number; style?: StyleProp<ViewStyle>; fit?: ImageContentFit; position?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <HueFallback hue={hue} style={[styles.fill, style]} />;
  return (
    <Image
      source={{ uri: src }}
      style={[styles.fill, style as object]}
      contentFit={fit}
      contentPosition={position as never}
      transition={240}
      cachePolicy="memory-disk"
      recyclingKey={src}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({ fill: { width: "100%", height: "100%" } });

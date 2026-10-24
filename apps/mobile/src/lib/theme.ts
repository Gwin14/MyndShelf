import { colors, flareStops, fontFamilies, radii, space } from "@myndshelf/design-tokens";
import { StyleSheet } from "react-native";

export { colors, flareStops, radii, space };
export const fonts = fontFamilies;

/** hsl() que o RN entende, a partir da matiz de cada item. */
export const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${Math.round(h)}, ${s}%, ${l}%, ${a})`;

export const type = StyleSheet.create({
  mono: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.9, textTransform: "uppercase", color: colors.paperMute },
  kicker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase", color: colors.paperMute },
  display: { fontFamily: fonts.display, color: colors.paper },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.paper },
  dim: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.paperDim },
});

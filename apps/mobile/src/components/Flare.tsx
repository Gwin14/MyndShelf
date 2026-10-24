import type { ComponentType, ReactElement, ReactNode } from "react";
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle, Text } from "react-native";
import RNMaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { colors, flareStops } from "../lib/theme";

// os tipos da lib ainda são de componente de classe antigo
const MaskedView = RNMaskedView as unknown as ComponentType<{ maskElement: ReactElement; children: ReactNode }>;

/** A labareda solar das referências: cobalto → ciano → sol → âmbar → brasa → magenta. */
export function Flare({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <LinearGradient
      colors={flareStops.colors as unknown as [string, string, ...string[]]}
      locations={flareStops.locations as unknown as [number, number, ...number[]]}
      start={{ x: 0, y: 0.4 }}
      end={{ x: 1, y: 0.6 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}

const WARM = [colors.sun, colors.amber, colors.ember] as const;

/** Texto pintado com o gradiente quente (o itálico dos títulos). */
export function GradientText({ style, children, full }: { style?: StyleProp<TextStyle>; children: ReactNode; full?: boolean }) {
  return (
    <MaskedView maskElement={<Text style={[style, styles.mask]}>{children}</Text>}>
      <LinearGradient
        colors={(full ? flareStops.colors : WARM) as unknown as [string, string, ...string[]]}
        start={{ x: 0, y: 0.3 }}
        end={{ x: 1, y: 0.7 }}
      >
        <Text style={[style, styles.hidden]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

const styles = StyleSheet.create({
  mask: { backgroundColor: "transparent" },
  hidden: { opacity: 0 },
});

import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";
import { GradientText } from "./Flare";

/** Título editorial: serif grande com uma palavra em itálico tingida de sol. */
export function Headline({ kicker, before, em, after, size = 44 }: { kicker: string; before?: string; em: string; after?: string; size?: number }) {
  const title = [styles.title, { fontSize: size, lineHeight: size * 1.02 }];
  const space = { marginRight: size * 0.24 };
  // uma palavra por peça: ao quebrar a linha, nenhuma começa com espaço sobrando
  const words = (t?: string) => (t ? t.split(/\s+/).filter(Boolean) : []);
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>{kicker}</Text>
      <View style={styles.line}>
        {words(before).map((w, i) => (
          <Text key={`b${i}`} style={[title, space]}>
            {w}
          </Text>
        ))}
        <View style={space}>
          <GradientText style={[title, styles.em]}>{em}</GradientText>
        </View>
        {words(after).map((w, i) => (
          <Text key={`a${i}`} style={[title, space]}>
            {w}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 18 },
  kicker: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase", color: colors.paperMute, marginBottom: 6 },
  line: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" },
  title: {
    fontFamily: fonts.display,
    color: colors.paper,
    letterSpacing: -0.8,
    textShadowColor: "rgba(111, 214, 255, 0.25)",
    textShadowRadius: 24,
  },
  em: { fontFamily: fonts.displayItalic, paddingRight: 4 },
});

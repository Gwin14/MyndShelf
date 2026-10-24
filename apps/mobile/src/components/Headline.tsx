import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "../lib/theme";
import { GradientText } from "./Flare";

/** Título editorial: serif grande com uma palavra em itálico tingida de sol. */
export function Headline({ kicker, before, em, after, size = 44 }: { kicker: string; before?: string; em: string; after?: string; size?: number }) {
  const title = [styles.title, { fontSize: size, lineHeight: size * 1.02 }];
  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>{kicker}</Text>
      <View style={styles.line}>
        {before ? <Text style={title}>{before} </Text> : null}
        <GradientText style={[title, styles.em]}>{em}</GradientText>
        {after ? <Text style={title}> {after}</Text> : null}
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

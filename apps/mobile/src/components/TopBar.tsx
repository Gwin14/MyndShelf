import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Settings2 } from "lucide-react-native";
import { useLibrary } from "../lib/store";
import { colors, fonts } from "../lib/theme";
import { GradientText } from "./Flare";
import { Touch } from "./Touch";

/** Marca + contagem de objetos em órbita + ajustes — o cabeçalho do desktop, enxuto. */
export function TopBar({ right }: { right?: ReactNode }) {
  const total = useLibrary((s) => s.captures.length + s.creations.length);
  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        <GradientText full style={styles.star}>
          ✦
        </GradientText>
        <Text style={styles.name}>
          Mynd<Text style={styles.em}>shelf</Text>
        </Text>
      </View>
      <Text style={styles.meta}>{String(total).padStart(3, "0")} em órbita</Text>
      {right}
      <Touch onPress={() => router.push("/settings")} hitSlop={10} style={styles.icon} accessibilityLabel="Ajustes">
        <Settings2 size={19} color={colors.paperDim} />
      </Touch>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 10, height: 44, marginBottom: 6 },
  brand: { flexDirection: "row", alignItems: "center", gap: 7, flex: 1 },
  star: { fontSize: 16 },
  name: { fontFamily: fonts.display, fontSize: 22, color: colors.paper, letterSpacing: -0.2 },
  em: { fontFamily: fonts.displayItalic, color: colors.paperDim },
  meta: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", color: colors.paperMute },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
});

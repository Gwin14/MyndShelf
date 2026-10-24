import { StyleSheet, Text, View } from "react-native";
import { tap } from "../lib/haptics";
import { colors, fonts } from "../lib/theme";
import { Touch } from "./Touch";

/** Alternância em pílula (Mural | Transmissões, Estante | Galeria). */
export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string; badge?: number }[]; onChange: (v: T) => void }) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <Touch
            key={o.id}
            style={[styles.item, on && styles.on]}
            onPress={() => {
              if (on) return;
              tap();
              onChange(o.id);
            }}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{o.label}</Text>
            {o.badge ? <Text style={styles.badge}>{o.badge > 99 ? "99+" : o.badge}</Text> : null}
          </Touch>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignSelf: "flex-start", padding: 3, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(239,230,210,0.03)" },
  item: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 999 },
  on: { backgroundColor: "rgba(239,230,210,0.09)", borderWidth: 1, borderColor: "rgba(239,230,210,0.14)" },
  label: { fontFamily: fonts.display, fontSize: 17, color: colors.paperMute },
  labelOn: { color: colors.paper },
  badge: { fontFamily: fonts.mono, fontSize: 9, color: colors.void, backgroundColor: colors.amber, borderRadius: 8, paddingHorizontal: 5, overflow: "hidden" },
});

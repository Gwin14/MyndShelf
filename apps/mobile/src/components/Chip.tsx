import type { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { tap } from "../lib/haptics";
import { colors, fonts } from "../lib/theme";
import { Touch } from "./Touch";

/** Filtro em pílula; o ativo ganha o brilho âmbar da barra lateral do desktop. */
export function Chip({ label, icon, active, count, onPress, onLongPress }: { label: string; icon?: ReactNode; active?: boolean; count?: number; onPress?: () => void; onLongPress?: () => void }) {
  return (
    <Touch
      onPress={() => {
        tap();
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[styles.chip, active && styles.active]}
    >
      {icon}
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
      {count != null && <Text style={styles.count}>{count}</Text>}
    </Touch>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(12, 10, 21, 0.6)",
  },
  active: {
    borderColor: "rgba(255, 180, 61, 0.55)",
    backgroundColor: "rgba(255, 180, 61, 0.1)",
    shadowColor: colors.amber,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  label: { fontFamily: fonts.body, fontSize: 13.5, color: colors.paperDim },
  labelActive: { color: colors.paper },
  count: { fontFamily: fonts.mono, fontSize: 10, color: colors.paperMute },
});

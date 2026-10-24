import type { ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts } from "../lib/theme";
import { Flare } from "./Flare";
import { Touch } from "./Touch";

type Props = {
  label?: string;
  icon?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: "line" | "flare" | "danger" | "ghost";
  small?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Pílula do desktop: contorno de papel, ou a labareda para a ação principal. */
export function Button({ label, icon, onPress, onLongPress, variant = "line", small, disabled, style }: Props) {
  const flare = variant === "flare";
  const inner = (
    <View style={[styles.row, small && styles.small, !label && (small ? styles.iconOnlySmall : styles.iconOnly)]}>
      {icon}
      {label ? (
        <Text style={[styles.label, small && styles.labelSmall, flare && styles.flareLabel, variant === "danger" && styles.danger]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
  return (
    <Touch
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={6}
      style={[styles.base, variant === "line" && styles.line, variant === "danger" && styles.dangerLine, flare && styles.flare, disabled && styles.disabled, style]}
    >
      {flare ? <Flare style={styles.flareFill}>{inner}</Flare> : inner}
    </Touch>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 999, overflow: "hidden", alignSelf: "flex-start" },
  line: { borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "rgba(239, 230, 210, 0.05)" },
  dangerLine: { borderWidth: 1, borderColor: "rgba(255, 90, 36, 0.4)" },
  flare: {
    shadowColor: colors.amber,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
    overflow: "visible",
  },
  flareFill: { borderRadius: 999 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, height: 42, paddingHorizontal: 18 },
  small: { height: 34, paddingHorizontal: 13, gap: 6 },
  iconOnly: { width: 42, paddingHorizontal: 0, justifyContent: "center" },
  iconOnlySmall: { width: 34, paddingHorizontal: 0, justifyContent: "center" },
  label: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.paper },
  labelSmall: { fontSize: 13 },
  flareLabel: { color: colors.void, fontFamily: fonts.bodyBold },
  danger: { color: colors.ember },
  disabled: { opacity: 0.4 },
});

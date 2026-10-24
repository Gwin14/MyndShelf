import { StyleSheet, Text, TextInput, type TextInputProps } from "react-native";
import { colors, fonts } from "../lib/theme";

export function Label({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

/** Campo de texto escuro com cursor âmbar. */
export function Field({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.paperMute}
      keyboardAppearance="dark"
      selectionColor={colors.amber}
      style={[styles.field, props.multiline && styles.area, style]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: colors.paperMute, marginTop: 22, marginBottom: 8 },
  field: {
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "rgba(6, 5, 11, 0.5)",
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.paper,
  },
  area: { minHeight: 96, textAlignVertical: "top", lineHeight: 21 },
});

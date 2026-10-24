import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ScrollViewProps } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors, fonts } from "../lib/theme";
import { Touch } from "./Touch";

/** Folha modal com alça, título em mono e o botão de fechar — o "modal" do desktop. */
export function ModalScreen({ kicker, right, children, scroll = true, contentStyle, ...rest }: { kicker?: string; right?: ReactNode; children: ReactNode; scroll?: boolean; contentStyle?: ScrollViewProps["contentContainerStyle"] } & ScrollViewProps) {
  const insets = useSafeAreaInsets();
  // no iOS o modal é uma folha (sem a área segura de cima); no Android, tela cheia
  const top = Platform.OS === "ios" ? 10 : insets.top + 6;
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.head, { paddingTop: top }]}>
        {Platform.OS === "ios" && <View style={styles.grip} />}
        <View style={styles.row}>
          <Text style={styles.kicker} numberOfLines={1}>
            {kicker}
          </Text>
          {right}
          <Touch onPress={() => router.back()} hitSlop={12} style={styles.close} accessibilityLabel="Fechar">
            <X size={18} color={colors.paperDim} />
          </Touch>
        </View>
      </View>
      {scroll ? (
        <ScrollView style={styles.flex} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }, contentStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" {...rest}>
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, { paddingBottom: insets.bottom }]}>{children}</View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, backgroundColor: "rgba(12,10,21,0.96)" },
  grip: { alignSelf: "center", width: 38, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, height: 44 },
  kicker: { flex: 1, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: colors.paperMute },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(239,230,210,0.06)" },
  content: { padding: 16, width: "100%", maxWidth: 720, alignSelf: "center" },
});

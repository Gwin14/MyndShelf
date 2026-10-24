import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToast } from "../lib/toast";
import { colors, fonts } from "../lib/theme";
import { Touch } from "./Touch";

export function ToastHost() {
  const toast = useToast((s) => s.toast);
  const dismiss = useToast((s) => s.dismiss);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.host, { paddingBottom: insets.bottom + 92 }]}>
      <Animated.View key={toast.id} entering={FadeInDown.springify().damping(16)} exiting={FadeOutDown.duration(180)} style={styles.toast}>
        <Text style={styles.star}>✦</Text>
        <Text style={styles.msg} numberOfLines={3}>
          {toast.message}
        </Text>
        {toast.action && (
          <Touch
            onPress={() => {
              toast.action!.run();
              dismiss();
            }}
            hitSlop={10}
          >
            <Text style={styles.action}>{toast.action.label}</Text>
          </Touch>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { justifyContent: "flex-end", alignItems: "center", paddingHorizontal: 16, zIndex: 100 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 520,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(21, 18, 41, 0.97)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  star: { color: colors.amber, fontSize: 13 },
  msg: { flexShrink: 1, fontFamily: fonts.body, fontSize: 14, color: colors.paper },
  action: { fontFamily: fonts.mono, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: colors.amber },
});

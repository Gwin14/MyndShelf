import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { BASE, EASE } from "../../lib/motion";
import { ClipboardPaste, X } from "lucide-react-native";
import { Button } from "../../components/Button";
import { Touch } from "../../components/Touch";
import { captureText } from "../../lib/capture";
import { success } from "../../lib/haptics";
import { colors, fonts } from "../../lib/theme";

/**
 * O ⌘V do desktop no celular: ao voltar para o app com um link copiado,
 * oferece guardar. Só lê a área de transferência quando a pessoa toca.
 */
export function ClipboardOffer() {
  const [show, setShow] = useState(false);

  const check = useCallback(async () => {
    try {
      setShow(await Clipboard.hasUrlAsync());
    } catch {
      setShow(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void check());
    return () => sub.remove();
  }, [check]);

  if (!show) return null;
  return (
    <Animated.View entering={FadeInUp.duration(BASE).easing(EASE)} exiting={FadeOutUp} style={styles.wrap}>
      <ClipboardPaste size={18} color={colors.amber} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Link copiado</Text>
        <Text style={styles.hint}>Guardar na Captura?</Text>
      </View>
      <Button
        small
        variant="flare"
        label="Colar"
        onPress={async () => {
          setShow(false);
          const text = (await Clipboard.getUrlAsync().catch(() => null)) ?? (await Clipboard.getStringAsync());
          if (text) {
            success();
            await captureText(text);
          }
          // esvazia para não oferecer o mesmo link de novo
          void Clipboard.setStringAsync("");
        }}
      />
      <Touch hitSlop={10} onPress={() => setShow(false)} accessibilityLabel="Dispensar">
        <X size={16} color={colors.paperMute} />
      </Touch>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    paddingLeft: 14,
    marginBottom: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255, 180, 61, 0.35)",
    backgroundColor: "rgba(255, 180, 61, 0.07)",
  },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.paper },
  hint: { fontFamily: fonts.body, fontSize: 12.5, color: colors.paperDim },
});

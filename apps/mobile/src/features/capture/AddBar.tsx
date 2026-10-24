import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Camera, Image as ImageIcon, MessageCircleQuestion } from "lucide-react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { Button } from "../../components/Button";
import { Flare } from "../../components/Flare";
import { Touch } from "../../components/Touch";
import { captureImage, captureText } from "../../lib/capture";
import { success } from "../../lib/haptics";
import { colors, fonts } from "../../lib/theme";
import { toast } from "../../lib/toast";
import { useUi } from "../../lib/ui";

/**
 * O campo grande faz tudo, como no desktop: digitar filtra o mural,
 * ✦ guarda como nota/link/lugar e "Perguntar" consulta o acervo inteiro.
 */
export function AddBar() {
  const query = useUi((s) => s.captureQuery);
  const set = useUi((s) => s.set);
  const [focused, setFocused] = useState(false);
  const filled = query.trim().length > 0;

  const save = async () => {
    const text = query.trim();
    if (!text) return;
    set({ captureQuery: "" });
    success();
    const id = await captureText(text);
    if (id) toast("Guardado ✦", { label: "Abrir", run: () => router.push(`/capture/${id}`) }, 3000);
  };

  return (
    <View style={styles.wrap}>
      {filled && (
        <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut} style={styles.aura} pointerEvents="none">
          <Flare style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
      <View style={[styles.bar, focused && styles.focused]}>
        <Animated.Text style={styles.star}>✦</Animated.Text>
        <TextInput
          value={query}
          onChangeText={(captureQuery) => set({ captureQuery })}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Cole um link, escreva uma ideia…"
          placeholderTextColor={colors.paperMute}
          style={styles.input}
          multiline
          autoCapitalize="sentences"
          autoCorrect
          keyboardAppearance="dark"
          selectionColor={colors.amber}
          submitBehavior="blurAndSubmit"
          returnKeyType="done"
          onSubmitEditing={() => void save()}
        />
        {!filled && (
          <View style={styles.tools}>
            <Touch hitSlop={8} style={styles.tool} onPress={() => void captureImage("camera")} accessibilityLabel="Fotografar">
              <Camera size={19} color={colors.paperDim} />
            </Touch>
            <Touch hitSlop={8} style={styles.tool} onPress={() => void captureImage("library")} accessibilityLabel="Escolher da galeria">
              <ImageIcon size={19} color={colors.paperDim} />
            </Touch>
          </View>
        )}
      </View>
      {filled && (
        <Animated.View entering={FadeIn} style={styles.actions}>
          <Button small variant="flare" label="Guardar" onPress={() => void save()} />
          <Button
            small
            label="Perguntar ao acervo"
            icon={<MessageCircleQuestion size={15} color={colors.paper} />}
            onPress={() => router.push({ pathname: "/ask", params: { q: query.trim() } })}
          />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  aura: { position: "absolute", top: 4, left: 10, right: 10, height: 44, borderRadius: 22, opacity: 0.28, overflow: "hidden", transform: [{ scaleY: 1.2 }] },
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 54,
    paddingVertical: 8,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(12, 10, 21, 0.88)",
  },
  focused: { borderColor: "rgba(255, 180, 61, 0.5)" },
  star: { marginTop: 9, color: colors.amber, textShadowColor: colors.amber, textShadowRadius: 10 },
  input: { flex: 1, minHeight: 36, maxHeight: 180, paddingTop: 6, paddingBottom: 4, fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.paper },
  tools: { flexDirection: "row", alignSelf: "center" },
  tool: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  actions: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
});

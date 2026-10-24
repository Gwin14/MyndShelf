import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, ZoomIn } from "react-native-reanimated";
import { usePrompt } from "../lib/prompt";
import { colors, fonts } from "../lib/theme";
import { Button } from "./Button";
import { Field } from "./Field";

export function PromptHost() {
  const prompt = usePrompt((s) => s.prompt);
  const [value, setValue] = useState("");
  useEffect(() => setValue(prompt?.initial ?? ""), [prompt]);
  if (!prompt) return null;
  const done = (v: string | null) => {
    usePrompt.setState({ prompt: null });
    prompt.resolve(v?.trim() ? v.trim() : null);
  };
  return (
    <Modal transparent visible animationType="none" onRequestClose={() => done(null)} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Animated.View entering={FadeIn.duration(150)} style={StyleSheet.absoluteFill}>
          <Pressable style={styles.backdrop} onPress={() => done(null)} />
        </Animated.View>
        <View style={styles.center} pointerEvents="box-none">
          <Animated.View entering={ZoomIn.springify().damping(18)} style={styles.card}>
            <Text style={styles.title}>{prompt.title}</Text>
            <Field value={value} onChangeText={setValue} placeholder={prompt.placeholder} autoFocus returnKeyType="done" onSubmitEditing={() => done(value)} />
            <View style={styles.row}>
              <Button small variant="ghost" label="Cancelar" onPress={() => done(null)} />
              <Button small variant="flare" label={prompt.action ?? "Guardar"} disabled={!value.trim()} onPress={() => done(value)} />
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(6,5,11,0.65)" },
  center: { flex: 1, justifyContent: "center", padding: 24 },
  card: { alignSelf: "center", width: "100%", maxWidth: 420, gap: 14, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.nebula },
  title: { fontFamily: fonts.display, fontSize: 26, color: colors.paper },
  row: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});

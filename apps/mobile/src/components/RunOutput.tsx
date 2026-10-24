import { useEffect, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import Animated, { FadeIn, LinearTransition, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from "react-native-reanimated";
import { BASE, EASE } from "../lib/motion";
import { useAi, type RunState } from "../lib/ai";
import { openInApp } from "../lib/platform";
import { colors, fonts } from "../lib/theme";
import { Button } from "./Button";
import { Prose, type ProseRef } from "./Prose";
import { Touch } from "./Touch";

/** Estado de uma resposta: esperando, escrevendo, pedindo a chave ou com erro. */
export function RunOutput({ state, label, onRetry, resolve }: { state: RunState; label: string; onRetry(): void; resolve?: (key: string) => ProseRef | undefined }) {
  return (
    <Animated.View layout={LinearTransition.duration(BASE).easing(EASE)}>
      <Body state={state} label={label} onRetry={onRetry} resolve={resolve} />
    </Animated.View>
  );
}

function Body({ state, label, onRetry, resolve }: Parameters<typeof RunOutput>[0]) {
  switch (state.status) {
    case "idle":
      return null;
    case "thinking":
      return <Thinking label={label} />;
    case "needs-key":
      return <KeyField onSaved={onRetry} />;
    case "error":
      return (
        <Animated.View entering={FadeIn} style={styles.error}>
          <Text style={styles.errorText}>{state.message}</Text>
          <Touch onPress={onRetry} hitSlop={8}>
            <Text style={styles.retry}>tentar de novo</Text>
          </Touch>
        </Animated.View>
      );
    default:
      return <Prose text={state.text} streaming={state.status === "streaming"} resolve={resolve} />;
  }
}

function Star({ delay }: { delay: number }) {
  const o = useSharedValue(0.2);
  useEffect(() => {
    o.value = withDelay(delay, withRepeat(withTiming(1, { duration: 700 }), -1, true));
  }, [delay, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ scale: 0.7 + o.value * 0.5 }] }));
  return <Animated.Text style={[styles.star, anim]}>✦</Animated.Text>;
}

/** Esperando a primeira palavra: o rótulo brilha como as labaredas do céu. */
export function Thinking({ label }: { label: string }) {
  return (
    <View style={styles.thinking}>
      <Star delay={0} />
      <Star delay={200} />
      <Star delay={400} />
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

/** Pedido da chave no próprio lugar da resposta, na primeira vez. */
export function KeyField({ onSaved }: { onSaved?: () => void }) {
  const [draft, setDraft] = useState("");
  const setKey = useAi((s) => s.setKey);
  const save = () => {
    if (!draft.trim()) return;
    setKey(draft);
    onSaved?.();
  };
  return (
    <View style={styles.key}>
      <Text style={styles.keyText}>Isto usa a API do Gemini. Cole uma chave; ela fica guardada só neste aparelho, no cofre do sistema.</Text>
      <View style={styles.keyRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Chave da API do Gemini"
          placeholderTextColor={colors.paperMute}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          keyboardAppearance="dark"
          style={styles.field}
          onSubmitEditing={save}
        />
        <Button small label="Guardar" disabled={!draft.trim()} onPress={save} />
      </View>
      <Touch onPress={() => void openInApp("https://aistudio.google.com/apikey")}>
        <Text style={styles.keyLink}>criar uma chave no Google AI Studio ↗</Text>
      </Touch>
    </View>
  );
}

const styles = StyleSheet.create({
  thinking: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  star: { color: colors.amber, fontSize: 12 },
  label: { marginLeft: 8, fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.4, textTransform: "uppercase", color: colors.paperDim },
  error: { gap: 6 },
  errorText: { fontFamily: fonts.mono, fontSize: 11, color: colors.ember, lineHeight: 16 },
  retry: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.amber },
  key: { gap: 10, padding: 14, borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineStrong },
  keyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.paperDim },
  keyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flex: 1, height: 40, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(6,5,11,0.5)", color: colors.paper, fontFamily: fonts.mono, fontSize: 12 },
  keyLink: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.cyan },
});

import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { Button } from "../components/Button";
import { Field } from "../components/Field";
import { ModalScreen } from "../components/ModalScreen";
import type { ProseRef } from "../components/Prose";
import { RunOutput } from "../components/RunOutput";
import { askLibrary, useAiRun, type LibraryRef } from "../lib/ai";
import { library } from "../lib/store";
import { colors, fonts } from "../lib/theme";

/** Pergunta ao acervo inteiro, com os itens citados tocáveis. */
export default function Ask() {
  const params = useLocalSearchParams<{ q?: string }>();
  const [draft, setDraft] = useState("");
  const [question, setQuestion] = useState(params.q ?? "");
  const { state, run, retry } = useAiRun();
  const refs = useRef(new Map<string, LibraryRef>());

  useEffect(() => {
    if (question) void run((onText, signal) => askLibrary(question, (r) => (refs.current = r), onText, signal));
  }, [question, run]);

  const resolve = useCallback((key: string): ProseRef | undefined => {
    const ref = refs.current.get(key);
    const lib = library.getState();
    if (ref?.type === "capture") {
      const c = lib.captures.find((x) => x.id === ref.id);
      return c && { label: c.title, hue: c.hue, open: () => router.push(`/capture/${c.id}`) };
    }
    if (ref?.type === "creation") {
      const c = lib.creations.find((x) => x.id === ref.id);
      return c && { label: c.title, hue: c.hue, open: () => router.push(`/creation/${c.id}`) };
    }
    if (ref?.type === "project") {
      const p = lib.projects.find((x) => x.id === ref.id);
      return p && { label: p.name, hue: p.hue, open: () => router.push(`/project/${p.id}`) };
    }
  }, []);

  const ask = () => {
    if (!draft.trim()) return;
    setQuestion(draft.trim());
    setDraft("");
  };

  return (
    <ModalScreen kicker="Perguntar ao acervo">
      {question ? <Text style={styles.question}>{question}</Text> : <Text style={styles.empty}>O que você quer saber sobre o que guardou?</Text>}
      <View style={styles.answer}>
        <RunOutput state={state} label="percorrendo o acervo" onRetry={retry} resolve={resolve} />
      </View>
      <View style={styles.row}>
        <Field value={draft} onChangeText={setDraft} placeholder={question ? "Outra pergunta…" : "Ex.: que livros guardei sobre o espaço?"} style={{ flex: 1 }} returnKeyType="send" onSubmitEditing={ask} autoFocus={!question} />
        <Button variant="flare" icon={<Send size={16} color={colors.void} />} onPress={ask} disabled={!draft.trim()} />
      </View>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  question: { fontFamily: fonts.displayItalic, fontSize: 30, lineHeight: 33, color: colors.paper, marginBottom: 16 },
  empty: { fontFamily: fonts.displayItalic, fontSize: 26, lineHeight: 30, color: colors.paperDim, marginBottom: 16 },
  answer: { marginBottom: 24 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
});

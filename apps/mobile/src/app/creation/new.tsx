import { useState } from "react";
import { StyleSheet, TextInput } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "../../components/Button";
import { ModalScreen } from "../../components/ModalScreen";
import { addManuscript } from "../../lib/files";
import { success } from "../../lib/haptics";
import { colors, fonts } from "../../lib/theme";

/** Escrever direto no app: o texto vira um manuscrito (.md) na estante. */
export default function NewManuscript() {
  const { shelf } = useLocalSearchParams<{ shelf?: string }>();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const save = async () => {
    const id = await addManuscript(title.trim(), body, shelf ?? null);
    success();
    router.replace(`/creation/${id}`);
  };
  return (
    <ModalScreen kicker="Novo manuscrito" right={<Button small variant="flare" label="Guardar" disabled={!body.trim() && !title.trim()} onPress={() => void save()} />}>
      <TextInput value={title} onChangeText={setTitle} placeholder="Título" placeholderTextColor={colors.paperMute} style={styles.title} keyboardAppearance="dark" selectionColor={colors.amber} autoFocus />
      <TextInput value={body} onChangeText={setBody} placeholder="Comece a escrever…" placeholderTextColor={colors.paperMute} style={styles.body} multiline keyboardAppearance="dark" selectionColor={colors.amber} scrollEnabled={false} />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 34, color: colors.paper, paddingVertical: 8 },
  body: { minHeight: 400, fontFamily: fonts.prose, fontSize: 18, lineHeight: 28, color: colors.paper, textAlignVertical: "top" },
});

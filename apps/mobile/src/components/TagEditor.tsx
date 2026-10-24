import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { X } from "lucide-react-native";
import { suggestTags, useAi, useGlow } from "../lib/ai";
import { tap } from "../lib/haptics";
import { library } from "../lib/store";
import { colors, fonts } from "../lib/theme";
import { Thinking } from "./RunOutput";
import { Touch } from "./Touch";

/** Etiquetas da captura: tocar remove, "✦ sugerir" pede ao Gemini, campo no fim adiciona. */
export function TagEditor({ id, tags, ready }: { id: string; tags: string[]; ready: boolean }) {
  const [draft, setDraft] = useState("");
  const working = useGlow((s) => !!s.working[id]);
  const fresh = useGlow((s) => s.fresh);
  const hasKey = useAi((s) => !!s.key);
  const update = (next: string[]) => library.getState().updateCapture(id, { tags: next });
  const add = () => {
    const t = draft.trim().toLowerCase().replace(/^#/, "");
    if (t && !tags.includes(t)) update([...tags, t]);
    setDraft("");
  };

  return (
    <View style={styles.wrap}>
      {tags.map((t) => (
        <Touch
          key={t}
          style={[styles.tag, fresh[`${id}:tag:${t}`] && styles.glow]}
          onPress={() => {
            tap();
            update(tags.filter((x) => x !== t));
          }}
        >
          <Text style={styles.tagText}>{t}</Text>
          <X size={11} color={colors.paperMute} />
        </Touch>
      ))}
      {working ? (
        <View style={styles.tag}>
          <Thinking label="lendo" />
        </View>
      ) : (
        tags.length < 5 &&
        ready && (
          <Touch style={[styles.tag, styles.suggest]} onPress={() => (hasKey ? void suggestTags(id).catch(() => {}) : router.push("/settings"))}>
            <Text style={[styles.tagText, { color: colors.amber }]}>✦ sugerir</Text>
          </Touch>
        )
      )}
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={add}
        onBlur={() => draft.trim() && add()}
        placeholder="+ etiqueta"
        placeholderTextColor={colors.paperMute}
        autoCapitalize="none"
        returnKeyType="done"
        submitBehavior="submit"
        keyboardAppearance="dark"
        selectionColor={colors.amber}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: "rgba(239,230,210,0.05)" },
  glow: { borderColor: colors.amber, shadowColor: colors.amber, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  suggest: { borderStyle: "dashed", borderColor: "rgba(255,180,61,0.5)" },
  tagText: { fontFamily: fonts.body, fontSize: 13.5, color: colors.paper },
  input: { minWidth: 110, height: 32, paddingHorizontal: 6, fontFamily: fonts.body, fontSize: 14, color: colors.paper },
});

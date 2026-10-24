import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Radio } from "lucide-react-native";
import { Button } from "../../components/Button";
import { Field } from "../../components/Field";
import { Headline } from "../../components/Headline";
import { ModalScreen } from "../../components/ModalScreen";
import { Thinking } from "../../components/RunOutput";
import { subscribe } from "../../lib/feeds";
import { success, warn } from "../../lib/haptics";
import { colors, fonts } from "../../lib/theme";
import { toast } from "../../lib/toast";
import { useUi } from "../../lib/ui";

const EXAMPLES = ["um blog ou revista", "canal do YouTube", "subreddit", "repo do GitHub", "perfil do Bluesky ou Mastodon", "Letterboxd", "podcast da Apple", "SoundCloud"];

/** Qualquer link serve: o feed é encontrado sozinho (regras em packages/core/src/feedResolve.ts). */
export default function AddFeed() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const go = async () => {
    if (!url.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const { id, via } = await subscribe(url.trim());
      success();
      useUi.getState().set({ captureMode: "feeds", captureFeed: id });
      toast(`${via} sintonizado ✦`);
      router.back();
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : "Nenhum feed encontrado.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalScreen kicker="Transmissões · nova frequência">
      <Headline kicker="Sintonizar" before="Sinais de" em="longe." size={38} />
      <Text style={styles.hint}>Cole o endereço de {EXAMPLES.join(", ")} — ou o próprio RSS.</Text>
      <Field value={url} onChangeText={setUrl} placeholder="https://…" autoCapitalize="none" autoCorrect={false} keyboardType="url" autoFocus returnKeyType="go" onSubmitEditing={() => void go()} />
      <View style={styles.row}>
        <Button variant="flare" label="Sintonizar" icon={<Radio size={15} color={colors.void} />} disabled={busy || !url.trim()} onPress={() => void go()} />
        <Button label="Colar" onPress={async () => setUrl((await Clipboard.getStringAsync()).trim())} />
      </View>
      {busy && <Thinking label="procurando a frequência" />}
      {error && <Text style={styles.error}>⚠ {error}</Text>}
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: colors.paperDim, marginBottom: 16 },
  row: { flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 12 },
  error: { fontFamily: fonts.mono, fontSize: 11, color: colors.ember, lineHeight: 16 },
});

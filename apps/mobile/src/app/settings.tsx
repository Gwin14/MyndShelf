import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import { Download, Upload } from "lucide-react-native";
import { Button } from "../components/Button";
import { Field, Label } from "../components/Field";
import { Headline } from "../components/Headline";
import { ModalScreen } from "../components/ModalScreen";
import { Touch } from "../components/Touch";
import { useAi } from "../lib/ai";
import { exportLibrary, importLibrary } from "../lib/backup";
import { openInApp } from "../lib/platform";
import { useLibrary } from "../lib/store";
import { colors, fonts } from "../lib/theme";
import { toast } from "../lib/toast";

export default function Settings() {
  const { key, autoTag, setKey, setAutoTag } = useAi();
  const [draft, setDraft] = useState(key);
  const dirty = draft.trim() !== key;
  const counts = {
    c: useLibrary((s) => s.captures.length),
    e: useLibrary((s) => s.creations.length),
    p: useLibrary((s) => s.projects.length),
    f: useLibrary((s) => s.feeds.length),
  };

  return (
    <ModalScreen kicker="Ajustes">
      <Headline kicker="MyndShelf" before="Pequenos" em="ajustes." size={38} />

      <Text style={styles.section}>Gemini</Text>
      <Text style={styles.sub}>Etiquetas, resumos, leitura de documentos e as perguntas ao acervo usam a API do Gemini. A chave fica guardada só neste aparelho, no cofre do sistema.</Text>
      <Label>Chave da API</Label>
      <View style={styles.row}>
        <Field value={draft} onChangeText={setDraft} placeholder="Cole aqui" secureTextEntry autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} />
        <Button
          small
          label="Guardar"
          disabled={!dirty}
          onPress={() => {
            setKey(draft);
            toast("Chave guardada");
          }}
        />
      </View>
      <Touch onPress={() => void openInApp("https://aistudio.google.com/apikey")} style={{ marginTop: 10 }}>
        <Text style={styles.link}>criar uma chave no Google AI Studio ↗</Text>
      </Touch>

      <View style={styles.toggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Etiquetar ao guardar</Text>
          <Text style={styles.sub}>Capturas novas ganham etiquetas de assunto, reaproveitando as que você já usa. Links sem tipo definido ganham a capa certa.</Text>
        </View>
        <Switch value={autoTag} onValueChange={setAutoTag} trackColor={{ true: colors.amber, false: colors.dusk }} thumbColor={colors.paper} />
      </View>

      <Text style={[styles.section, { marginTop: 34 }]}>Acervo</Text>
      <Text style={styles.sub}>
        {counts.c} capturas · {counts.e} criações · {counts.p} projetos · {counts.f} transmissões. Tudo vive neste aparelho; exporte para levar ao desktop ou guardar uma cópia.
      </Text>
      <View style={[styles.row, { marginTop: 14 }]}>
        <Button label="Exportar" icon={<Upload size={15} color={colors.paper} />} onPress={() => void exportLibrary()} />
        <Button label="Importar" icon={<Download size={15} color={colors.paper} />} onPress={() => void importLibrary()} />
      </View>

      <Text style={[styles.section, { marginTop: 34 }]}>Atalho</Text>
      <Text style={styles.sub}>
        Outros apps e o Atalhos do iOS podem guardar direto na Captura abrindo <Text style={styles.code}>myndshelf://save?url=…</Text> (ou <Text style={styles.code}>?text=…</Text>).
      </Text>

      <Text style={styles.about}>✦ MyndShelf {Constants.expoConfig?.version} · Vintage Cosmic Dreamscape</Text>
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: fonts.display, fontSize: 26, color: colors.paper, marginTop: 6 },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.paperDim, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  link: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.cyan },
  toggle: { flexDirection: "row", gap: 14, alignItems: "center", marginTop: 24, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  toggleTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.paper },
  code: { fontFamily: fonts.mono, fontSize: 12, color: colors.amber },
  about: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: colors.paperMute, textAlign: "center", marginTop: 40 },
});

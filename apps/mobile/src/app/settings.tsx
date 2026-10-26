import { useState } from "react";
import { Image, StyleSheet, Switch, Text, View } from "react-native";
import Constants from "expo-constants";
import { type AlternateAppIcons, getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from "expo-alternate-app-icons";
import { Download, RefreshCw, Upload } from "lucide-react-native";
import { Button } from "../components/Button";
import { Field, Label } from "../components/Field";
import { Headline } from "../components/Headline";
import { ModalScreen } from "../components/ModalScreen";
import { Touch } from "../components/Touch";
import { useAi } from "../lib/ai";
import { exportLibrary, importLibrary } from "../lib/backup";
import { openInApp } from "../lib/platform";
import { useLibrary } from "../lib/store";
import { sync, useSync } from "../lib/sync";
import { colors, fonts } from "../lib/theme";
import { toast } from "../lib/toast";

export default function Settings() {
  const { key, autoTag, setKey, setAutoTag } = useAi();
  const [draft, setDraft] = useState(key);
  const dirty = draft.trim() !== key;
  const serverAi = useSync((s) => s.ai);
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
      {serverAi && <Text style={[styles.sub, { marginTop: 10 }]}>Sem chave aqui, a IA passa pelo seu servidor, que guarda a dele.</Text>}

      <View style={styles.toggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleTitle}>Etiquetar ao guardar</Text>
          <Text style={styles.sub}>Capturas novas ganham etiquetas de assunto, reaproveitando as que você já usa. Links sem tipo definido ganham a capa certa.</Text>
        </View>
        <Switch value={autoTag} onValueChange={setAutoTag} trackColor={{ true: colors.amber, false: colors.dusk }} thumbColor={colors.paper} />
      </View>

      <IconSettings />

      <ServerSettings />

      <Text style={[styles.section, { marginTop: 34 }]}>Acervo</Text>
      <Text style={styles.sub}>
        {counts.c} capturas · {counts.e} criações · {counts.p} projetos · {counts.f} transmissões. Tudo vive neste aparelho; exporte para guardar uma cópia.
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

function syncLine(s: ReturnType<typeof sync.status.getState>): string {
  const queue = [s.pending && `${s.pending} ${s.pending === 1 ? "mudança" : "mudanças"} na fila`, s.pendingFiles && `${s.pendingFiles} ${s.pendingFiles === 1 ? "arquivo" : "arquivos"} para subir`]
    .filter(Boolean)
    .join(" · ");
  if (s.phase === "syncing") return "Sincronizando…";
  if (s.phase === "offline") return `Sem conexão com o servidor. ${queue || "Nada pendente"}; tudo continua funcionando aqui.`;
  if (s.phase === "error") return s.error ?? "Algo deu errado.";
  const when = s.lastSync ? new Date(s.lastSync).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "ainda não";
  return `Última sincronização: ${when}${queue ? ` · ${queue}` : ""}.`;
}

/** null = ícone principal; os demais são os nomes registrados no app.json. */
const ICONS: { name: AlternateAppIcons | null; label: string; preview: number }[] = [
  { name: null, label: "Mind Shelf", preview: require("../../assets/app-icons/MindShelf-preview.png") },
  { name: "Cosmos", label: "Cosmos", preview: require("../../assets/app-icons/Cosmos-preview.png") },
  { name: "Emblema", label: "Emblema", preview: require("../../assets/app-icons/Emblema-preview.png") },
];

function IconSettings() {
  const [current, setCurrent] = useState(() => getAppIconName());
  if (!supportsAlternateIcons) return null;

  const choose = async (name: AlternateAppIcons | null) => {
    if (name === current) return;
    try {
      await setAlternateAppIcon(name);
      setCurrent(name);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu para trocar o ícone");
    }
  };

  return (
    <>
      <Text style={[styles.section, { marginTop: 34 }]}>Ícone</Text>
      <Text style={styles.sub}>Como o MyndShelf aparece na tela de início.</Text>
      <View style={styles.icons}>
        {ICONS.map((icon) => {
          const on = icon.name === current;
          return (
            <Touch key={icon.label} onPress={() => void choose(icon.name)} style={styles.iconOption}>
              <View style={[styles.iconRing, on && { borderColor: colors.amber }]}>
                <Image source={icon.preview} style={styles.iconImage} />
              </View>
              <Text style={[styles.iconLabel, on && { color: colors.paper }]}>{icon.label}</Text>
            </Touch>
          );
        })}
      </View>
    </>
  );
}

/** Self-hosted: liga o celular ao servidor do homelab. */
function ServerSettings() {
  const status = useSync((s) => s);
  const [url, setUrl] = useState(status.url ?? "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    setBusy(true);
    setError("");
    try {
      await sync.connect({ url, token });
      setToken("");
      toast("Conectado ao servidor ✦");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const dot = { idle: colors.cyan, syncing: colors.amber, offline: colors.paperMute, error: colors.ember, off: colors.paperMute }[status.phase];

  return (
    <>
      <Text style={[styles.section, { marginTop: 34 }]}>Servidor</Text>
      {status.url ? (
        <>
          <Text style={styles.sub}>
            Sincronizando com <Text style={styles.code}>{status.url.replace(/^https?:\/\//, "")}</Text>. O acervo vive neste aparelho e funciona sem conexão; as
            mudanças sobem quando o servidor responde.
          </Text>
          <View style={styles.syncRow}>
            <View style={[styles.dot, { backgroundColor: dot }]} />
            <Text style={[styles.sub, { flex: 1, marginTop: 0 }]}>{syncLine(status)}</Text>
          </View>
          <View style={[styles.row, { marginTop: 14 }]}>
            <Button label="Sincronizar" icon={<RefreshCw size={15} color={colors.paper} />} disabled={status.phase === "syncing"} onPress={() => void sync.now()} />
            <Button label="Desconectar" variant="ghost" onPress={() => void sync.disconnect()} />
          </View>
          <View style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleTitle}>Manter arquivos offline</Text>
              <Text style={styles.sub}>Baixa todos os originais da Estante. Desligado, cada arquivo desce quando você abre e fica guardado aqui.</Text>
            </View>
            <Switch value={status.keepFiles} onValueChange={sync.setKeepFiles} trackColor={{ true: colors.amber, false: colors.dusk }} thumbColor={colors.paper} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.sub}>Ligue ao seu servidor self-hosted (pelo Tailscale) para ter o mesmo acervo aqui, no desktop e no site. Sem servidor, tudo fica só neste aparelho.</Text>
          <Label>Endereço</Label>
          <Field value={url} onChangeText={setUrl} placeholder="https://myndshelf.seu-tailnet.ts.net" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Label>Token</Label>
          <View style={styles.row}>
            <Field value={token} onChangeText={setToken} placeholder="MYNDSHELF_TOKEN" secureTextEntry autoCapitalize="none" autoCorrect={false} style={{ flex: 1 }} />
            <Button small label={busy ? "…" : "Conectar"} disabled={busy || !url.trim() || !token.trim()} onPress={() => void connect()} />
          </View>
          {!!error && <Text style={[styles.sub, { color: colors.ember, marginTop: 10 }]}>{error}</Text>}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  icons: { flexDirection: "row", gap: 18, marginTop: 16 },
  iconOption: { alignItems: "center", gap: 8 },
  iconRing: { padding: 3, borderRadius: 22, borderWidth: 2, borderColor: "transparent" },
  iconImage: { width: 68, height: 68 },
  iconLabel: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: colors.paperMute },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  section: { fontFamily: fonts.display, fontSize: 26, color: colors.paper, marginTop: 6 },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.paperDim, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  link: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.cyan },
  toggle: { flexDirection: "row", gap: 14, alignItems: "center", marginTop: 24, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line },
  toggleTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: colors.paper },
  code: { fontFamily: fonts.mono, fontSize: 12, color: colors.amber },
  about: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 1, textTransform: "uppercase", color: colors.paperMute, textAlign: "center", marginTop: 40 },
});

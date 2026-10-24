import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { BookOpen, Ellipsis, ScanText, Share2, Star } from "lucide-react-native";
import { formatBytes, MEDIUM_LABELS, relativeDate } from "@myndshelf/core";
import type { Creation } from "@myndshelf/types";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Field, Label } from "../../components/Field";
import { ModalScreen } from "../../components/ModalScreen";
import { Prose } from "../../components/Prose";
import { ProjectLinks } from "../../components/ProjectLinks";
import { RunOutput } from "../../components/RunOutput";
import { Touch } from "../../components/Touch";
import { ShelfObject } from "../../features/shelf/ShelfObject";
import { analyzeCreation, canReadCreation, useAiRun } from "../../lib/ai";
import { docKindOf, shareCreation } from "../../lib/files";
import { creationMenu } from "../../lib/menus";
import { openSheet } from "../../lib/sheet";
import { library, useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";

const ICON = { size: 15, color: colors.paper };

export default function CreationDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useLibrary((s) => s.creations.find((c) => c.id === id));
  const shelves = useLibrary((s) => s.shelves);
  const analysis = useAiRun();
  if (!item) return <ModalScreen kicker="Estante">{null}</ModalScreen>;

  const update = (patch: Partial<Creation>) => library.getState().updateCreation(item.id, patch);
  const canOpen = !!item.filePath && (!!docKindOf(item) || /^(image|audio|video)$/.test(item.medium));
  const busy = analysis.state.status === "thinking" || analysis.state.status === "streaming";

  return (
    <ModalScreen
      kicker={`${MEDIUM_LABELS[item.medium]} · ${relativeDate(item.createdAt)}${item.size ? ` · ${formatBytes(item.size)}` : ""}`}
      right={
        <Touch hitSlop={10} style={styles.more} onPress={() => openSheet(creationMenu(item, { inDetail: true }), item.title)}>
          <Ellipsis size={18} color={colors.paperDim} />
        </Touch>
      }
    >
      <Touch style={styles.stage} disabled={!canOpen} onPress={() => router.push(`/creation/read/${item.id}`)} scale={0.97}>
        <ShelfObject item={item} active scale={1.4} />
      </Touch>

      <Field value={item.title} onChangeText={(title) => update({ title })} style={styles.title} multiline scrollEnabled={false} />
      {item.fileName ? <Text style={styles.file}>{item.fileName}</Text> : null}

      <View style={styles.actions}>
        {canOpen && <Button small variant="flare" label="Abrir" icon={<BookOpen size={14} color={colors.void} />} onPress={() => router.push(`/creation/read/${item.id}`)} />}
        <Button
          small
          label={item.featured ? "Na vitrine" : "Pôr na vitrine"}
          icon={<Star size={14} color={item.featured ? colors.amber : colors.paper} fill={item.featured ? colors.amber : "none"} />}
          onPress={() => update({ featured: !item.featured })}
        />
        {canReadCreation(item) && (
          <Button small disabled={busy} label={busy ? "Lendo…" : item.analysis ? "Analisar de novo" : "Analisar"} icon={<ScanText {...ICON} />} onPress={() => void analysis.run((onText, signal) => analyzeCreation(item, onText, signal))} />
        )}
        {item.filePath && <Button small icon={<Share2 {...ICON} />} onPress={() => void shareCreation(item)} />}
      </View>

      {(analysis.state.status !== "idle" || item.analysis) && (
        <>
          <Label>Leitura</Label>
          <View style={styles.analysis}>{analysis.state.status !== "idle" ? <RunOutput state={analysis.state} label="lendo o documento" onRetry={analysis.retry} /> : <Prose text={item.analysis!} />}</View>
        </>
      )}

      <Label>Ano</Label>
      <Field value={item.year ? String(item.year) : ""} onChangeText={(t) => update({ year: Number(t.replace(/\D/g, "")) || undefined })} keyboardType="number-pad" placeholder="2026" style={{ width: 120 }} />

      <Label>Estante</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="Entrada" active={!item.shelfId} onPress={() => update({ shelfId: null })} />
        {shelves.map((s) => (
          <Chip key={s.id} label={s.name} active={item.shelfId === s.id} onPress={() => update({ shelfId: s.id })} />
        ))}
      </ScrollView>

      <Label>Notas</Label>
      <Field multiline value={item.notes ?? ""} onChangeText={(notes) => update({ notes })} placeholder="Contexto, técnica, para quem foi…" />

      <Label>Projetos</Label>
      <ProjectLinks kind="creation" refId={item.id} />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  more: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  stage: { alignItems: "center", justifyContent: "center", minHeight: 280, paddingVertical: 30 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 33, borderWidth: 0, backgroundColor: "transparent", paddingHorizontal: 0 },
  file: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.8, color: colors.paperMute, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 16 },
  analysis: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(239,230,210,0.03)" },
});

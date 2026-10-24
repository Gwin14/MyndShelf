import { useEffect, useState } from "react";
import { Share, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AlignLeft, BookOpen, Ellipsis, Expand, Globe, MapPin, Play, Radio, RefreshCw, Share2 } from "lucide-react-native";
import { describeFeedSource, formatPrice, KIND_LABELS, relativeDate, VIEW_LABELS, viewModeOf } from "@myndshelf/core";
import type { CaptureItem } from "@myndshelf/types";
import { Button } from "../../components/Button";
import { Field, Label } from "../../components/Field";
import { ModalScreen } from "../../components/ModalScreen";
import { ProjectLinks } from "../../components/ProjectLinks";
import { RunOutput } from "../../components/RunOutput";
import { TagEditor } from "../../components/TagEditor";
import { Touch } from "../../components/Touch";
import { Cover } from "../../features/capture/covers/Cover";
import { canSummarizeCapture, summarizeCapture, useAiRun, warmCapture } from "../../lib/ai";
import { refreshCapture } from "../../lib/capture";
import { subscribe } from "../../lib/feeds";
import { captureMenu } from "../../lib/menus";
import { openInApp } from "../../lib/platform";
import { openSheet } from "../../lib/sheet";
import { library, useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";
import { toast } from "../../lib/toast";
import { useUi } from "../../lib/ui";

const ICON = { size: 15, color: colors.paper };

export default function CaptureDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useLibrary((s) => s.captures.find((c) => c.id === id));
  const { width } = useWindowDimensions();
  const summary = useAiRun();
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    const it = library.getState().captures.find((c) => c.id === id);
    if (it) warmCapture(it);
  }, [id]);

  if (!item) return <ModalScreen kicker="Captura">{null}</ModalScreen>;

  const update = (patch: Partial<CaptureItem>) => library.getState().updateCapture(item.id, patch);
  const mode = item.status === "ready" ? viewModeOf(item) : undefined;
  const summarizing = summary.state.status === "thinking" || summary.state.status === "streaming";
  const source = item.url ? describeFeedSource(item.url) : undefined;
  const canFollow = !!item.url && !source?.unsupported && (!!source || ["article", "link", "code", "podcast", "video"].includes(item.kind));
  const coverW = Math.min(width - 64, 340);
  const view = () => router.push(`/view/${item.id}`);

  const follow = async () => {
    setFollowing(true);
    try {
      const { id: feedId, via } = await subscribe(item.url!);
      useUi.getState().set({ captureMode: "feeds", captureFeed: feedId });
      toast(`${via} encontrado`);
      router.dismissTo("/");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Nenhum feed encontrado");
    } finally {
      setFollowing(false);
    }
  };

  return (
    <ModalScreen
      kicker={`${KIND_LABELS[item.kind]} · guardado ${relativeDate(item.createdAt)}`}
      right={
        <Touch hitSlop={10} style={styles.more} onPress={() => openSheet(captureMenu(item, { inDetail: true }), item.title)} accessibilityLabel="Mais ações">
          <Ellipsis size={18} color={colors.paperDim} />
        </Touch>
      }
    >
      <Touch onPress={mode ? view : undefined} disabled={!mode} scale={0.98} style={styles.stage}>
        <Cover item={item} width={coverW} active />
      </Touch>

      <TextInput value={item.title} onChangeText={(title) => update({ title })} multiline style={styles.title} keyboardAppearance="dark" selectionColor={colors.amber} scrollEnabled={false} />
      {(item.author || item.siteName) && (
        <Text style={styles.sub}>
          {item.author ? `${item.author} · ` : ""}
          {item.siteName}
        </Text>
      )}
      {item.product?.price != null && (
        <Text style={styles.price}>
          {formatPrice(item.product.price, item.product.currency)}
          {item.product.available === false ? " · esgotado" : ""}
        </Text>
      )}
      {item.place?.address ? (
        <View style={styles.row}>
          <MapPin size={14} color={colors.amber} />
          <Text style={[styles.desc, { flex: 1, marginTop: 0 }]}>{item.place.address}</Text>
        </View>
      ) : null}
      {item.description ? <Text style={styles.desc}>{item.description}</Text> : null}

      <View style={styles.actions}>
        {mode && (
          <Button
            variant="flare"
            small
            label={VIEW_LABELS[mode]}
            icon={mode === "play" ? <Play size={14} color={colors.void} fill={colors.void} /> : mode === "read" ? <BookOpen size={14} color={colors.void} /> : mode === "map" ? <MapPin size={14} color={colors.void} /> : <Expand size={14} color={colors.void} />}
            onPress={view}
          />
        )}
        {item.url && <Button small variant={mode ? "line" : "flare"} label={mode ? "Original" : "Abrir"} icon={<Globe size={14} color={mode ? colors.paper : colors.void} />} onPress={() => void openInApp(item.url!)} />}
        {canSummarizeCapture(item) && (
          <Button
            small
            disabled={summarizing}
            label={summarizing ? "Resumindo…" : summary.state.status === "done" ? "Resumir de novo" : "Resumir"}
            icon={<AlignLeft {...ICON} />}
            onPress={() => void summary.run((onText, signal) => summarizeCapture(item, onText, signal))}
          />
        )}
        {canFollow && <Button small disabled={following} label={following ? "Sintonizando…" : "Seguir"} icon={<Radio {...ICON} />} onPress={() => void follow()} />}
        {item.url && <Button small icon={<Share2 {...ICON} />} onPress={() => void Share.share({ url: item.url!, message: item.url!, title: item.title })} />}
        {item.url && <Button small icon={<RefreshCw {...ICON} />} onPress={() => void refreshCapture(item.id)} />}
      </View>

      {summary.state.status !== "idle" && (
        <>
          <Label>Resumo</Label>
          <View style={styles.summary}>
            <RunOutput state={summary.state} label="resumindo" onRetry={summary.retry} />
          </View>
        </>
      )}

      <Label>{item.kind === "note" ? "Texto" : "Anotação"}</Label>
      <Field multiline value={item.note ?? ""} onChangeText={(note) => update({ note })} placeholder="Por que isso te chamou atenção?" style={item.kind === "note" && styles.noteField} />

      <Label>Etiquetas</Label>
      <TagEditor id={item.id} tags={item.tags} ready={item.status === "ready"} />

      <Label>Projetos</Label>
      <ProjectLinks kind="capture" refId={item.id} />
    </ModalScreen>
  );
}

const styles = StyleSheet.create({
  more: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  stage: { alignItems: "center", paddingVertical: 22, marginHorizontal: -16, marginBottom: 8 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 34, color: colors.paper, padding: 0 },
  sub: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.paperMute, marginTop: 8 },
  price: { fontFamily: fonts.display, fontSize: 24, color: colors.amber, marginTop: 8 },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginTop: 12 },
  desc: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.paperDim, marginTop: 12 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  summary: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: "rgba(239,230,210,0.03)" },
  noteField: { minHeight: 180, fontFamily: fonts.prose, fontSize: 17, lineHeight: 25 },
});

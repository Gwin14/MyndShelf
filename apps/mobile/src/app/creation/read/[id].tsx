import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pause, Play, Share2, X } from "lucide-react-native";
import type { Creation } from "@myndshelf/types";
import { Button } from "../../../components/Button";
import { Empty } from "../../../components/Empty";
import { Segmented } from "../../../components/Segmented";
import { Touch } from "../../../components/Touch";
import { Zoomable } from "../../../components/Zoomable";
import { ShelfObject } from "../../../features/shelf/ShelfObject";
import { documentHtml, pdfHtml } from "../../../lib/documents";
import { docKindOf, shareCreation, type DocKind } from "../../../lib/files";
import { openInApp } from "../../../lib/platform";
import { useCreationFile } from "../../../lib/sync";
import { useLibrary } from "../../../lib/store";
import { colors, fonts } from "../../../lib/theme";

/** Abre a criação por dentro: imagem, texto/código, áudio, vídeo e PDF. */
export default function ReadCreation() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const item = useLibrary((s) => s.creations.find((c) => c.id === id));
  const insets = useSafeAreaInsets();
  const { file, loading } = useCreationFile(item);
  const kind = item ? docKindOf(item) : undefined;

  let body: React.ReactNode = loading ? (
    <Empty title="Baixando do servidor…" hint="Depois disso o arquivo fica guardado neste aparelho." />
  ) : (
    <Empty title="O arquivo não está neste aparelho." hint="Criações importadas de outro aparelho trazem só a prévia. Ligue ao servidor para baixar o original." />
  );
  if (item && file) {
    if (item.medium === "image") body = <ImageFile uri={file.uri} />;
    else if (item.medium === "audio") body = <AudioFile item={item} uri={file.uri} />;
    else if (item.medium === "video") body = <VideoFile uri={file.uri} />;
    else if (kind === "pdf") body = <PdfFile item={item} file={file} top={insets.top + 56} />;
    else if (kind === "html") body = <HtmlFile item={item} file={file} top={insets.top + 56} />;
    else if (kind) body = <DocFile item={item} kind={kind} file={file} top={insets.top + 56} />;
    else body = <ShareInstead item={item} />;
  }

  return (
    <View style={styles.root}>
      {body}
      <View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Touch onPress={() => router.back()} hitSlop={12} style={styles.round}>
          <X size={18} color={colors.paper} />
        </Touch>
        <Text style={styles.title} numberOfLines={1}>
          {item?.title}
        </Text>
        {file && item ? (
          <Touch onPress={() => void shareCreation(item)} hitSlop={12} style={styles.round}>
            <Share2 size={17} color={colors.paper} />
          </Touch>
        ) : null}
      </View>
    </View>
  );
}

function ImageFile({ uri }: { uri: string }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={styles.center}>
      <Zoomable width={width} height={height}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" />
      </Zoomable>
    </View>
  );
}

/** Links do documento abrem no navegador por cima; o resto da navegação fica parado. */
const keepInside = (req: ShouldStartLoadRequest) => {
  if (req.isTopFrame === false || !/^https?:/.test(req.url)) return true;
  void openInApp(req.url);
  return false;
};

function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.amber} />
    </View>
  );
}

function DocFile({ item, kind, file, top }: { item: Creation; kind: Exclude<DocKind, "pdf" | "html">; file: File; top: number }) {
  const [html, setHtml] = useState<string | null>();
  useEffect(() => {
    let alive = true;
    setHtml(undefined);
    documentHtml(item, kind, file, top)
      .then((h) => alive && setHtml(h))
      .catch(() => alive && setHtml(null));
    return () => {
      alive = false;
    };
  }, [file.uri, kind, top]);
  if (html === undefined) return <Loading />;
  if (html === null) return <ShareInstead item={item} message="Não deu para ler este arquivo aqui." />;
  return <WebView source={{ html }} style={styles.flex} originWhitelist={["*"]} javaScriptEnabled={false} onShouldStartLoadWithRequest={keepInside} decelerationRate="normal" />;
}

/** Página HTML como página (sem scripts) ou como código-fonte. */
function HtmlFile({ item, file, top }: { item: Creation; file: File; top: number }) {
  const [source, setSource] = useState(false);
  return (
    <View style={styles.flex}>
      {source ? (
        <DocFile item={item} kind="code" file={file} top={top + 44} />
      ) : (
        <WebView
          source={{ uri: file.uri }}
          style={[styles.flex, { marginTop: top + 44 }]}
          originWhitelist={["*"]}
          allowFileAccess
          allowingReadAccessToURL={file.parentDirectory.uri}
          javaScriptEnabled={false}
          onShouldStartLoadWithRequest={keepInside}
        />
      )}
      <View style={[styles.seg, { top }]}>
        <Segmented
          value={source ? "source" : "page"}
          onChange={(v) => setSource(v === "source")}
          options={[
            { id: "page", label: "Página" },
            { id: "source", label: "Código" },
          ]}
        />
      </View>
    </View>
  );
}

/** iOS mostra PDF nativo; no Android as páginas são desenhadas pelo pdf.js (precisa de internet). */
function PdfFile({ item, file, top }: { item: Creation; file: File; top: number }) {
  const [html, setHtml] = useState<string>();
  const tooBig = file.size > 30 * 1024 * 1024;
  useEffect(() => {
    if (Platform.OS === "ios" || tooBig) return;
    void file.base64().then((b64) => setHtml(pdfHtml(b64, top)));
  }, [file.uri]);
  if (Platform.OS === "ios") return <WebView source={{ uri: file.uri }} style={[styles.flex, { marginTop: top }]} originWhitelist={["*"]} allowFileAccess allowingReadAccessToURL={file.parentDirectory.uri} />;
  if (tooBig) return <ShareInstead item={item} message="Este PDF é grande demais para abrir aqui." />;
  if (!html) return <Loading />;
  return <WebView source={{ html }} style={styles.flex} originWhitelist={["*"]} />;
}

const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function AudioFile({ item, uri }: { item: Creation; uri: string }) {
  const player = useAudioPlayer({ uri });
  const status = useAudioPlayerStatus(player);
  const progress = status.duration ? status.currentTime / status.duration : 0;
  return (
    <View style={[styles.center, { gap: 40 }]}>
      <ShelfObject item={item} active={status.playing} scale={1.5} />
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <Text style={styles.time}>
        {time(status.currentTime)} / {time(status.duration)}
      </Text>
      <Button
        variant="flare"
        label={status.playing ? "Pausar" : "Tocar"}
        icon={status.playing ? <Pause size={16} color={colors.void} /> : <Play size={16} color={colors.void} fill={colors.void} />}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) void player.seekTo(0);
            player.play();
          }
        }}
      />
    </View>
  );
}

function VideoFile({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => p.play());
  return <VideoView player={player} style={styles.flex} nativeControls contentFit="contain" allowsPictureInPicture />;
}

function ShareInstead({ item, message = "Este formato abre melhor em outro app." }: { item: Creation; message?: string }) {
  return (
    <View style={[styles.center, { gap: 30, padding: 24 }]}>
      <ShelfObject item={item} scale={1.4} />
      <Text style={styles.plainCenter}>{message}</Text>
      <Button variant="flare" label="Abrir com…" icon={<Share2 size={15} color={colors.void} />} onPress={() => void shareCreation(item)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  seg: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,10,21,0.82)", borderWidth: 1, borderColor: colors.lineStrong },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.paper },
  plainCenter: { fontFamily: fonts.displayItalic, fontSize: 22, color: colors.paperDim, textAlign: "center" },
  track: { width: 260, height: 3, borderRadius: 2, backgroundColor: colors.lineStrong, overflow: "hidden" },
  fill: { height: 3, backgroundColor: colors.amber },
  time: { fontFamily: fonts.mono, fontSize: 11, color: colors.paperMute, marginTop: -28 },
});

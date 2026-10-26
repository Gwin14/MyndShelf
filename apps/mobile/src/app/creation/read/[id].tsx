import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { File } from "expo-file-system";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVideoPlayer, VideoView } from "expo-video";
import { Pause, Play, Share2, X } from "lucide-react-native";
import type { Creation } from "@myndshelf/types";
import { Button } from "../../../components/Button";
import { Empty } from "../../../components/Empty";
import { Prose } from "../../../components/Prose";
import { Touch } from "../../../components/Touch";
import { Zoomable } from "../../../components/Zoomable";
import { ShelfObject } from "../../../features/shelf/ShelfObject";
import { docKindOf, shareCreation } from "../../../lib/files";
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
    else if (kind === "pdf") body = Platform.OS === "ios" ? <WebView source={{ uri: file.uri }} style={styles.web} originWhitelist={["*"]} allowFileAccess /> : <ShareInstead item={item} />;
    else if (kind) body = <TextFile uri={file.uri} kind={kind} top={insets.top + 56} />;
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
        {item?.filePath ? (
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

function TextFile({ uri, kind, top }: { uri: string; kind: string; top: number }) {
  const [text, setText] = useState<string>();
  useEffect(() => {
    void new File(uri)
      .text()
      .then(setText)
      .catch(() => setText(""));
  }, [uri]);
  if (text === undefined) return <View style={styles.center} />;
  const code = kind === "code" || kind === "html";
  return (
    <ScrollView contentContainerStyle={{ paddingTop: top, padding: 20, paddingBottom: 80 }}>
      {code ? (
        <ScrollView horizontal>
          <Text selectable style={styles.code}>
            {text}
          </Text>
        </ScrollView>
      ) : kind === "markdown" ? (
        <Prose text={text} size={18} />
      ) : (
        <Text selectable style={styles.plain}>
          {text}
        </Text>
      )}
    </ScrollView>
  );
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

function ShareInstead({ item }: { item: Creation }) {
  return (
    <View style={[styles.center, { gap: 30, padding: 24 }]}>
      <ShelfObject item={item} scale={1.4} />
      <Text style={styles.plainCenter}>Este formato abre melhor em outro app.</Text>
      <Button variant="flare" label="Abrir com…" icon={<Share2 size={15} color={colors.void} />} onPress={() => void shareCreation(item)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  flex: { flex: 1 },
  web: { flex: 1, backgroundColor: colors.void, marginTop: 100 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,10,21,0.82)", borderWidth: 1, borderColor: colors.lineStrong },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.paper },
  code: { fontFamily: fonts.mono, fontSize: 12.5, lineHeight: 19, color: "rgba(255,180,61,0.85)" },
  plain: { fontFamily: fonts.prose, fontSize: 18, lineHeight: 28, color: colors.paper },
  plainCenter: { fontFamily: fonts.displayItalic, fontSize: 22, color: colors.paperDim, textAlign: "center" },
  track: { width: 260, height: 3, borderRadius: 2, backgroundColor: colors.lineStrong, overflow: "hidden" },
  fill: { height: 3, backgroundColor: colors.amber },
  time: { fontFamily: fonts.mono, fontSize: 11, color: colors.paperMute, marginTop: -28 },
});

import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { WebView } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Copy, Globe, Minus, Navigation, Plus, X } from "lucide-react-native";
import { formatCoords, getEmbed, mapLinks, viewModeOf } from "@myndshelf/core";
import type { CaptureItem } from "@myndshelf/types";
import { Button } from "../../components/Button";
import { Empty } from "../../components/Empty";
import { MapTiles } from "../../components/MapTiles";
import { Touch } from "../../components/Touch";
import { Zoomable } from "../../components/Zoomable";
import { entryAsItem } from "../../lib/feeds";
import { copyText } from "../../lib/menus";
import { openSheet } from "../../lib/sheet";
import { openInApp } from "../../lib/platform";
import { loadArticle, type Article } from "../../lib/reader";
import { useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";
import { EMBED_ORIGIN, embedHtml, readerHtml } from "../../lib/webview";

/** Links dentro do leitor/player abrem no navegador por cima, sem sair do app. */
const intercept = (first: string) => (req: ShouldStartLoadRequest) => {
  // o iframe do player carrega por dentro; só navegações da página principal saem
  if (req.isTopFrame === false || req.url === first || req.url.startsWith("about:") || req.url.startsWith(EMBED_ORIGIN)) return true;
  if (/^https?:/.test(req.url)) void openInApp(req.url);
  return false;
};

export default function ViewerScreen() {
  const { id, entry } = useLocalSearchParams<{ id: string; entry?: string }>();
  const capture = useLibrary((s) => s.captures.find((c) => c.id === id));
  const feedEntry = useLibrary((s) => (entry ? s.feedEntries.find((e) => e.id === id) : undefined));
  const feed = useLibrary((s) => (feedEntry ? s.feeds.find((f) => f.id === feedEntry.feedId) : undefined));
  const item: CaptureItem | undefined = capture ?? (feedEntry ? entryAsItem(feedEntry, feed) : undefined);
  const insets = useSafeAreaInsets();
  const mode = item ? viewModeOf(item) : undefined;

  return (
    <View style={styles.root}>
      {item && mode === "play" && <Player item={item} />}
      {item && mode === "read" && <Reader item={item} top={insets.top + 56} />}
      {item && mode === "image" && <Picture item={item} />}
      {item && mode === "map" && <PlaceMap item={item} />}
      {(!item || !mode) && <Empty title="Nada para mostrar aqui." />}

      <View style={[styles.bar, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Touch onPress={() => router.back()} hitSlop={12} style={styles.round} accessibilityLabel="Fechar">
          <X size={18} color={colors.paper} />
        </Touch>
        <Text style={styles.title} numberOfLines={1}>
          {item?.title}
        </Text>
        {item?.url ? (
          <Touch onPress={() => void openInApp(item.url!)} hitSlop={12} style={styles.round} accessibilityLabel="Abrir original">
            <Globe size={17} color={colors.paper} />
          </Touch>
        ) : null}
      </View>
    </View>
  );
}

function Player({ item }: { item: CaptureItem }) {
  const embed = getEmbed(item.url)!;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const h = embed.type === "video" ? Math.min(width * 0.5625, height - 160) : Math.min(embed.height ?? 400, height - insets.top - 140);
  const html = embedHtml(embed.src);
  return (
    <View style={[styles.center, { paddingTop: insets.top + 40 }]}>
      <View style={[styles.frame, { width: embed.type === "video" ? width : Math.min(width - 24, 640), height: h, borderRadius: embed.type === "video" ? 0 : 14 }]}>
        <WebView
          source={{ html, baseUrl: EMBED_ORIGIN }}
          style={styles.web}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsFullscreenVideo
          allowsPictureInPictureMediaPlayback
          javaScriptEnabled
          onShouldStartLoadWithRequest={intercept(EMBED_ORIGIN)}
          setSupportMultipleWindows={false}
          startInLoadingState
          renderLoading={() => <ActivityIndicator color={colors.amber} style={StyleSheet.absoluteFill} />}
        />
      </View>
      <Text style={styles.provider}>{embed.provider}</Text>
      {item.author || item.siteName ? <Text style={styles.sub}>{item.author ?? item.siteName}</Text> : null}
    </View>
  );
}

function Reader({ item, top }: { item: CaptureItem; top: number }) {
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadArticle(item.url!).then((a) => alive && setArticle(a));
    return () => {
      alive = false;
    };
  }, [item.url]);

  if (article === undefined)
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.amber} />
        <Text style={[styles.sub, { marginTop: 14 }]}>recebendo sinal…</Text>
      </View>
    );
  if (!article)
    return (
      <View style={styles.center}>
        <Empty title="Este texto não se deixou ler." hint="Alguns sites bloqueiam o leitor. Abra o original." />
        <Button variant="flare" label="Abrir original" onPress={() => void openInApp(item.url!)} />
      </View>
    );
  return (
    <WebView
      source={{ html: readerHtml({ ...article, siteName: article.siteName ?? item.siteName }, top), baseUrl: item.url }}
      style={styles.web}
      originWhitelist={["*"]}
      javaScriptEnabled={false}
      onShouldStartLoadWithRequest={intercept(item.url!)}
      decelerationRate="normal"
      contentInsetAdjustmentBehavior="never"
    />
  );
}

function Picture({ item }: { item: CaptureItem }) {
  const { width, height } = useWindowDimensions();
  return (
    <View style={styles.center}>
      <Zoomable width={width} height={height}>
        <Image source={{ uri: item.image }} style={{ width, height }} contentFit="contain" />
      </Zoomable>
    </View>
  );
}

function PlaceMap({ item }: { item: CaptureItem }) {
  const p = item.place!;
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [zoom, setZoom] = useState(Math.min(18, (p.zoom ?? 15) + 1));
  const native = Platform.OS === "ios" ? `maps://?ll=${p.lat},${p.lng}${p.name ? `&q=${encodeURIComponent(p.name)}` : ""}` : `geo:${p.lat},${p.lng}?q=${p.lat},${p.lng}${p.name ? `(${encodeURIComponent(p.name)})` : ""}`;
  return (
    <View style={StyleSheet.absoluteFill}>
      <MapTiles lat={p.lat!} lng={p.lng!} zoom={zoom} width={width} height={height} />
      <View style={[styles.pin, { left: width / 2 - 9, top: height / 2 - 9 }]} />
      <View style={[styles.zoom, { top: insets.top + 70 }]}>
        <Touch style={styles.round} onPress={() => setZoom((z) => Math.min(18, z + 1))}>
          <Plus size={18} color={colors.paper} />
        </Touch>
        <Touch style={styles.round} onPress={() => setZoom((z) => Math.max(3, z - 1))}>
          <Minus size={18} color={colors.paper} />
        </Touch>
      </View>
      <View style={[styles.mapCard, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.placeName}>{item.title}</Text>
        {p.address ? <Text style={styles.sub}>{p.address}</Text> : null}
        <Text style={[styles.sub, { color: colors.amber }]}>{formatCoords(p.lat!, p.lng!)}</Text>
        <View style={styles.mapActions}>
          <Button small variant="flare" label="Abrir no Mapas" icon={<Navigation size={14} color={colors.void} />} onPress={() => void Linking.openURL(native).catch(() => openInApp(mapLinks(p)[0].url))} />
          <Button small label="Outros apps" onPress={() => openSheet(mapLinks(p).map((l) => ({ label: l.label, onSelect: () => void Linking.openURL(l.url) })), "Abrir em")} />
          <Button small icon={<Copy size={14} color={colors.paper} />} onPress={() => copyText(`${p.lat}, ${p.lng}`, "Coordenadas copiadas")} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.void },
  web: { flex: 1, backgroundColor: colors.void },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 0 },
  frame: { overflow: "hidden", backgroundColor: "#000" },
  provider: { fontFamily: fonts.displayItalic, fontSize: 22, color: colors.paperDim, marginTop: 14 },
  sub: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.paperMute, textAlign: "center" },
  bar: { position: "absolute", left: 0, right: 0, top: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 8 },
  round: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(12,10,21,0.82)", borderWidth: 1, borderColor: colors.lineStrong },
  title: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: colors.paper, textShadowColor: "#000", textShadowRadius: 8 },
  pin: { position: "absolute", width: 18, height: 18, borderRadius: 9, backgroundColor: colors.ember, borderWidth: 3, borderColor: "#ece2cb", shadowColor: colors.ember, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  zoom: { position: "absolute", right: 12, gap: 8 },
  mapCard: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 18, gap: 4, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: "rgba(12,10,21,0.95)", borderTopWidth: 1, borderColor: colors.lineStrong },
  placeName: { fontFamily: fonts.display, fontSize: 28, color: colors.paper },
  mapActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
});

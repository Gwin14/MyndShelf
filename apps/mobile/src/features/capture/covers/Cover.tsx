import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { SLOW, smooth } from "../../../lib/motion";
import Svg, { Circle, Defs, Pattern, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";
import { Play } from "lucide-react-native";
import type { CaptureItem } from "@myndshelf/types";
import { formatCoords, formatPrice, hostOf, KIND_LABELS } from "@myndshelf/core";
import { Art, HueFallback } from "../../../components/Art";
import { Flare } from "../../../components/Flare";
import { MapTiles } from "../../../components/MapTiles";
import { colors, fonts, hsl } from "../../../lib/theme";
import { Blink, drop, INK, PAPER, Pulse, Repeat, Sheen, useSpin } from "./parts";

type Props = {
  item: CaptureItem;
  /** largura da capa em pontos — tudo escala a partir dela */
  width: number;
  /** aberta no detalhe: o disco sai da capa e gira, a TV acende… (o "hover" do desktop) */
  active?: boolean;
};
type CoverProps = Props & { k: number; fs: (n: number, min?: number) => number };

/**
 * Cada tipo de referência ganha um objeto físico:
 * música → disco, livro → livro, vídeo → TV de tubo, filme → película,
 * leitura → recorte de revista, código → terminal, lugar → cartão-postal…
 */
export const Cover = memo(function Cover(props: Props) {
  const k = Math.min(1.7, Math.max(0.68, props.width / 228));
  const fs = (n: number, min = 8) => Math.max(min, Math.round(n * k * 10) / 10);
  if (props.item.status === "loading") return <LoadingCover {...props} k={k} fs={fs} />;
  const C = COVERS[props.item.kind] ?? LinkCover;
  return <C {...props} k={k} fs={fs} />;
});

/** 0 → 1 quando a capa fica ativa (aberta no detalhe), sempre com a curva suave. */
function useActive(active?: boolean) {
  const t = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    t.value = smooth(active ? 1 : 0, SLOW);
  }, [active, t]);
  return t;
}

const mono = (size: number, color: string) => ({ fontFamily: fonts.mono, fontSize: size, letterSpacing: size * 0.08, textTransform: "uppercase" as const, color });

function LoadingCover({ width, fs }: CoverProps) {
  const spin = useSpin(1600);
  return (
    <View style={[styles.loading, { width, aspectRatio: 1.25 }]}>
      <Animated.View style={[styles.loadingOrbit, spin]}>
        <View style={styles.loadingDot} />
      </Animated.View>
      <Text style={mono(fs(9.5), colors.paperMute)}>recebendo sinal…</Text>
    </View>
  );
}

/* ── música: disco de vinil saindo da capa ── */
function MusicCover({ item, width, active }: CoverProps) {
  const H = width / 1.16;
  const disc = width * 0.8;
  const spin = useSpin(3200, !!active);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: smooth(active ? 0 : -disc * 0.16, SLOW) }] }));
  const grooves = Array.from({ length: 22 }, (_, i) => 49 - i * 0.8);
  return (
    <View style={{ width, height: H }}>
      <Animated.View style={[{ position: "absolute", top: H * 0.03, right: 0, width: disc, height: disc }, slide]}>
        <View style={[{ width: disc, height: disc, borderRadius: disc / 2, overflow: "hidden" }, drop]}>
          <Svg width={disc} height={disc} viewBox="0 0 100 100">
            <Circle cx="50" cy="50" r="50" fill="#0a090c" />
            {grooves.map((r) => (
              <Circle key={r} cx="50" cy="50" r={r} stroke="#1a1820" strokeWidth="0.45" fill="none" />
            ))}
            {/* reflexo de luz nas ranhuras */}
            <Polygon points="50,50 100,30 100,10" fill="rgba(255,255,255,0.1)" />
            <Polygon points="50,50 0,70 0,90" fill="rgba(255,255,255,0.07)" />
          </Svg>
          <Animated.View style={[styles.discLabel, { inset: disc * 0.32, borderRadius: disc }, spin]}>
            <Art src={item.image} hue={item.hue} />
            <View style={[styles.discHole, { inset: disc * 0.36 * 0.44 }]} />
          </Animated.View>
        </View>
      </Animated.View>
      <View style={[styles.sleeve, drop, { width: width * 0.86, height: width * 0.86 }]}>
        <Art src={item.image} hue={item.hue} />
        <Sheen />
      </View>
    </View>
  );
}

/* ── podcast: transmissão ── */
function PodcastCover({ item, width, fs }: CoverProps) {
  const d = width * 0.56;
  const ring = { position: "absolute" as const, width: d, height: d, borderRadius: d / 2, borderWidth: 1, borderColor: hsl(item.hue, 90, 70, 0.6) };
  return (
    <View style={[styles.podcast, { width, height: width }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="pod" cx="50%" cy="50%" r="70%">
            <Stop offset="0" stopColor={hsl(item.hue, 40, 14)} />
            <Stop offset="1" stopColor="#08070d" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#pod)" />
      </Svg>
      <Pulse style={ring} />
      <Pulse style={ring} delay={1200} />
      <Pulse style={ring} delay={2400} />
      <View style={{ width: d, height: d, borderRadius: d / 2, overflow: "hidden", borderWidth: 3, borderColor: "rgba(239,230,210,0.12)", shadowColor: hsl(item.hue, 80, 50), shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } }}>
        <Art src={item.image} hue={item.hue} />
      </View>
      <View style={styles.onAir}>
        <Text style={[mono(fs(8.5), colors.void), { fontFamily: fonts.monoBold }]}>no ar</Text>
      </View>
    </View>
  );
}

/* ── livro ── */
function BookCover({ item, width, active, fs }: CoverProps) {
  const w = width * 0.76;
  const h = w * 1.5;
  const t = useActive(active);
  const tilt = useAnimatedStyle(() => ({
    transform: [{ perspective: 900 }, { rotateY: `${-16 + 12 * t.value}deg` }],
  }));
  return (
    <View style={{ width, alignItems: "center", paddingTop: width * 0.04, paddingBottom: width * 0.03 }}>
      <Animated.View style={[{ width: w, height: h }, tilt]}>
        <View style={[styles.bookPages, { right: -7, top: h * 0.015, bottom: h * 0.015 }]}>
          <Repeat n={Math.round(h / 2)} render={(i) => <View key={i} style={{ height: 1, marginBottom: 1, backgroundColor: "#cfc4ab" }} />} />
        </View>
        <View style={[styles.bookBody, drop]}>
          {item.image ? (
            <Art src={item.image} hue={item.hue} />
          ) : (
            <View style={[styles.bookType, { backgroundColor: hsl(item.hue, 55, 32), padding: w * 0.14, paddingLeft: w * 0.18 }]}>
              <View style={[StyleSheet.absoluteFill, { margin: 6, borderWidth: 1, borderColor: "rgba(239,230,210,0.4)" }]} />
              <Text style={[mono(fs(8.5), colors.paper), { opacity: 0.75 }]} numberOfLines={1}>
                {item.author ?? item.siteName}
              </Text>
              <Text style={{ fontFamily: fonts.display, fontSize: fs(22, 14), lineHeight: fs(22.5, 14.5), color: colors.paper }} numberOfLines={5}>
                {item.title}
              </Text>
              <Text style={{ alignSelf: "center", color: colors.amber }}>✦</Text>
            </View>
          )}
          <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(255,255,255,0.18)", "rgba(0,0,0,0.3)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.bookSpine, { width: w * 0.08 }]} />
          <Sheen />
        </View>
      </Animated.View>
    </View>
  );
}

/* ── vídeo: televisão de tubo ── */
function VideoCover({ item, width, fs, active }: CoverProps) {
  const sw = width - 22;
  return (
    <LinearGradient colors={["#3a332b", "#1b1814", "#100e0b"]} locations={[0, 0.6, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.tv, drop, { width }]}>
      <View style={[styles.tvScreen, { width: sw, height: sw * 0.75, borderRadius: sw * 0.11 }]}>
        <Art src={item.image} hue={item.hue} />
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Pattern id="scan" width="3" height="3" patternUnits="userSpaceOnUse">
              <Rect y="2" width="3" height="1" fill="rgba(0,0,0,0.28)" />
            </Pattern>
            <RadialGradient id="vig" cx="50%" cy="50%" rx="60%" ry="55%">
              <Stop offset="0.55" stopColor="#000" stopOpacity="0" />
              <Stop offset="1" stopColor="#000" stopOpacity="0.75" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#scan)" />
          <Rect width="100%" height="100%" fill="url(#vig)" />
        </Svg>
        <View style={[styles.tvPlay, active && styles.tvPlayOn]}>
          <Play size={16} color={active ? colors.void : colors.paper} fill={active ? colors.void : colors.paper} />
        </View>
      </View>
      <View style={styles.tvFoot}>
        <Text style={mono(fs(8.5), "rgba(239,230,210,0.45)")} numberOfLines={1}>
          {hostOf(item.url) || "vídeo"}
        </Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={styles.knob} />
          <View style={styles.knob} />
        </View>
      </View>
    </LinearGradient>
  );
}

/* ── filme: película 35mm ── */
function FilmCover({ item, width, fs }: CoverProps) {
  const fw = width - 40;
  const fh = fw / 1.5;
  const holes = Math.ceil((fh + 34) / 14);
  const strip = (side: "left" | "right") => (
    <View style={[styles.filmStrip, { [side]: 0 }]}>
      <Repeat n={holes} render={(i) => <View key={i} style={styles.filmHole} />} />
    </View>
  );
  return (
    <View style={[styles.film, drop, { width }]}>
      {strip("left")}
      {strip("right")}
      <View style={{ width: fw, height: fh, borderRadius: 2, overflow: "hidden" }}>
        <Art src={item.image} hue={item.hue} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(120, 80, 30, 0.14)" }]} />
      </View>
      <View style={styles.filmEdge}>
        <Text style={mono(fs(8), colors.amber)}>◂ 35MM</Text>
        <Text style={[mono(fs(8), colors.amber), { flexShrink: 1 }]} numberOfLines={1}>
          {item.siteName}
        </Text>
      </View>
    </View>
  );
}

/* ── jogo: cartucho ── */
function GameCover({ item, width, fs, active }: CoverProps) {
  const w = width * 0.8;
  const h = w / 0.84;
  const t = useActive(active);
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -6 * t.value }, { rotate: `${-1.5 * t.value}deg` }],
  }));
  return (
    <View style={{ width, alignItems: "center", paddingVertical: width * 0.03 }}>
      <Animated.View style={[{ width: w, height: h }, drop, lift]}>
        <LinearGradient colors={[hsl(item.hue, 9, 30), hsl(item.hue, 11, 19)]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[styles.cart, { paddingTop: h * 0.15, paddingHorizontal: w * 0.09, paddingBottom: h * 0.13 }]}>
          <View style={[styles.cartGrip, { top: h * 0.04, height: h * 0.06, left: w * 0.12, right: w * 0.12 }]}>
            <Repeat n={Math.round((w * 0.76) / 5)} render={(i) => <View key={i} style={styles.cartRib} />} />
          </View>
          <View style={styles.cartLabel}>
            <View style={styles.cartArt}>
              {item.image ? (
                <Art src={item.image} hue={item.hue} position="top" />
              ) : (
                <View style={{ flex: 1 }}>
                  <HueFallback hue={item.hue} style={StyleSheet.absoluteFill} />
                  <Text style={[styles.cartTitle, { fontSize: fs(21, 13), lineHeight: fs(21, 13) }]} numberOfLines={4}>
                    {item.title}
                  </Text>
                </View>
              )}
              <Sheen />
            </View>
            <Flare style={{ height: 3, marginTop: 4 }} />
            <View style={styles.cartBand}>
              <Text style={[mono(fs(7.5, 7), "#3a3330"), { flexShrink: 1 }]} numberOfLines={1}>
                {item.siteName}
              </Text>
              <Text style={mono(fs(7.5, 7), "#3a3330")}>✦</Text>
            </View>
          </View>
          <Text style={[styles.cartArrow, { bottom: h * 0.035 }]}>▲</Text>
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

/* ── produto: foto de catálogo + etiqueta de preço ── */
function ProductCover({ item, width, fs }: CoverProps) {
  const p = item.product;
  const price = formatPrice(p?.price, p?.currency);
  const sold = p?.available === false;
  const shot = width - 24;
  return (
    <View style={[styles.product, drop, { width }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="paper" cx="50%" cy="40%" rx="80%" ry="70%">
            <Stop offset="0" stopColor="#fffaf0" />
            <Stop offset="0.75" stopColor={PAPER} />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#paper)" />
      </Svg>
      <View style={{ width: shot, height: shot, overflow: "hidden" }}>
        {item.image ? (
          <Art src={item.image} hue={item.hue} fit="contain" />
        ) : (
          // loja sem foto (bloqueou o leitor): uma sacola de papel com o nome dela
          <View style={[styles.bag, { width: shot * 0.58 }]}>
            <View style={[styles.bagHandle, { height: shot * 0.22 }]} />
            <LinearGradient colors={["#d2ad7c", "#b88c5a"]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={styles.bagBody}>
              <Text style={[styles.bagStore, { fontSize: fs(19, 13) }]} numberOfLines={3}>
                {p?.store ?? item.siteName}
              </Text>
            </LinearGradient>
          </View>
        )}
      </View>
      {/* etiqueta de papel pendurada por um barbante */}
      <View style={[styles.tag, { transform: [{ rotate: "7deg" }] }]}>
        <View style={styles.tagString} />
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 40" preserveAspectRatio="none">
          <Polygon points="14,0 100,0 100,40 14,40 0,20" fill="#efe6d4" />
        </Svg>
        <View style={styles.tagHole} />
        <Text style={[mono(fs(7.5, 7), "#8a7e6a"), { maxWidth: 110 }]} numberOfLines={1}>
          {p?.brand ?? p?.store ?? item.siteName}
        </Text>
        <Text style={[styles.tagPrice, { fontSize: fs(sold ? 17 : 22, 14) }, sold && styles.tagSold]}>{sold ? "esgotado" : (price ?? "✦")}</Text>
      </View>
    </View>
  );
}

/* ── leitura: recorte de revista ── */
function ArticleCover({ item, width, fs }: CoverProps) {
  const issue = String((item.hue * 7) % 97).padStart(2, "0");
  const pad = Math.round(16 * Math.min(1, width / 228));
  return (
    <View style={[styles.article, drop, { width, padding: pad, paddingBottom: pad + 2 }]}>
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="glow" cx="0%" cy="0%" rx="120%" ry="80%">
            <Stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <Stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="age" cx="100%" cy="100%" rx="80%" ry="60%">
            <Stop offset="0" stopColor="rgb(140,100,40)" stopOpacity="0.18" />
            <Stop offset="0.7" stopColor="rgb(140,100,40)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100" height="100" fill="url(#glow)" />
        <Rect width="100" height="100" fill="url(#age)" />
      </Svg>
      <View style={styles.mast}>
        <Text style={[mono(fs(8.5), INK), { flexShrink: 1 }]} numberOfLines={1}>
          {item.siteName ?? hostOf(item.url)}
        </Text>
        <Text style={mono(fs(8.5), INK)}>Nº {issue}</Text>
      </View>
      <View style={styles.mastRule} />
      <View style={[styles.mastRule, { marginTop: 1.5, marginBottom: 12 }]} />
      <Text style={{ fontFamily: fonts.display, fontSize: fs(26, 17), lineHeight: fs(26, 17), letterSpacing: -0.2, color: INK, marginBottom: 12 }} numberOfLines={6}>
        {item.title}
      </Text>
      {item.image ? (
        <View style={{ width: "100%", aspectRatio: 1.6, marginBottom: 10, overflow: "hidden" }}>
          <Art src={item.image} hue={item.hue} />
          {/* meio-tom de impressão barata */}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(236, 226, 203, 0.32)" }]} />
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <Pattern id="dots" width="3" height="3" patternUnits="userSpaceOnUse">
                <Circle cx="1.5" cy="1.5" r="0.7" fill="rgba(28,25,21,0.22)" />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#dots)" />
          </Svg>
        </View>
      ) : null}
      {item.description ? (
        <Text style={{ fontFamily: fonts.body, fontSize: fs(12, 10.5), lineHeight: fs(17, 15), color: "#4a4238" }} numberOfLines={4}>
          {item.description}
        </Text>
      ) : null}
    </View>
  );
}

/* ── imagem: prancha montada ── */
function ImageCover({ item, width, fs }: CoverProps) {
  const [ratio, setRatio] = useState(1);
  const iw = width - 18;
  return (
    <View style={[styles.print, drop, { width }]}>
      <View style={{ width: iw, height: iw / ratio, overflow: "hidden" }}>
        {item.image ? (
          <ImageWithRatio src={item.image} hue={item.hue} onRatio={setRatio} />
        ) : (
          <HueFallback hue={item.hue} style={{ flex: 1 }} />
        )}
      </View>
      <View style={styles.plate}>
        <Text style={mono(fs(8.5), "#6e6352")}>Pl. {String(item.hue % 64).padStart(2, "0")}</Text>
        <Text style={[mono(fs(8.5), "#6e6352"), { flexShrink: 1 }]} numberOfLines={1}>
          {item.siteName}
        </Text>
      </View>
    </View>
  );
}

function ImageWithRatio({ src, hue, onRatio }: { src: string; hue: number; onRatio: (r: number) => void }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <HueFallback hue={hue} style={{ flex: 1 }} />;
  return (
    <Image
      source={{ uri: src }}
      style={{ width: "100%", height: "100%" }}
      contentFit="cover"
      transition={240}
      onLoad={(e) => e.source.width && onRatio(Math.min(1.9, Math.max(0.55, e.source.width / e.source.height)))}
      onError={() => setFailed(true)}
    />
  );
}

/* ── código: terminal de fósforo ── */
function CodeCover({ item, width, fs }: CoverProps) {
  const path = (() => {
    try {
      return new URL(item.url!).pathname.replace(/^\//, "");
    } catch {
      return item.title;
    }
  })();
  const amber = "rgba(255, 180, 61, 0.8)";
  const glow = { textShadowColor: "rgba(255, 180, 61, 0.5)", textShadowRadius: 8 };
  return (
    <View style={[styles.term, drop, { width }]}>
      <LinearGradient colors={["#1a1408", "#080705"]} start={{ x: 0.3, y: 0 }} end={{ x: 0.6, y: 0.8 }} style={StyleSheet.absoluteFill} />
      <View style={styles.termBar}>
        <View style={styles.termDot} />
        <View style={styles.termDot} />
        <View style={styles.termDot} />
        <Text style={[mono(fs(8.5), "rgba(255,180,61,0.5)"), { marginLeft: "auto", flexShrink: 1 }]} numberOfLines={1}>
          {hostOf(item.url)}
        </Text>
      </View>
      <View style={{ padding: 12, paddingBottom: 16 }}>
        <Text style={[{ fontFamily: fonts.mono, fontSize: fs(10.5, 9), lineHeight: fs(16, 14), color: amber }, glow]}>
          <Text style={{ color: colors.cyan, textShadowColor: "rgba(111,214,255,0.6)", textShadowRadius: 8 }}>~ $</Text> clone {path}
          {"\n\n"}
          <Text style={{ color: colors.sun, fontFamily: fonts.monoBold, fontSize: fs(12, 10) }}>{item.title}</Text>
          {item.description ? `\n${item.description.slice(0, 140)}` : ""}
        </Text>
        <Blink style={{ width: 7, height: 12, marginTop: 4, backgroundColor: colors.amber }} />
      </View>
    </View>
  );
}

/* ── lugar: cartão-postal ── */
function Stamp({ hue, size }: { hue: number; size: number }) {
  return (
    <View style={[styles.stamp, { width: size, height: size * 1.18, backgroundColor: hsl(hue, 55, 32) }]}>
      <Text style={{ color: colors.sun }}>✦</Text>
    </View>
  );
}

function PlaceCover({ item, width, fs }: CoverProps) {
  const p = item.place;
  const iw = width - 16;
  if (p?.lat != null && p.lng != null) {
    const mh = iw * 0.75;
    return (
      <View style={[styles.postcard, drop, { width, paddingBottom: 26 }]}>
        <View style={{ width: iw, height: mh, overflow: "hidden" }}>
          <MapTiles lat={p.lat} lng={p.lng} zoom={p.zoom ?? 15} width={iw} height={mh} />
          <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
            <Defs>
              <RadialGradient id="mapv" cx="50%" cy="50%" rx="65%" ry="60%">
                <Stop offset="0.55" stopColor="rgb(80,50,20)" stopOpacity="0" />
                <Stop offset="1" stopColor="rgb(80,50,20)" stopOpacity="0.3" />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#mapv)" />
          </Svg>
          <View style={[styles.pinWrap, { left: iw / 2 - 7, top: mh / 2 - 7 }]}>
            <Pulse style={styles.pinRing} ms={2400} to={3.2} />
            <LinearGradient colors={[colors.sun, colors.ember, colors.magenta]} locations={[0, 0.6, 1]} start={{ x: 0.2, y: 0.2 }} end={{ x: 1, y: 1 }} style={styles.pin} />
          </View>
        </View>
        <View style={{ position: "absolute", top: 16, right: 16 }}>
          <Stamp hue={item.hue} size={30} />
        </View>
        <Text style={[mono(fs(8.5), "#6e6352"), styles.coords]} numberOfLines={1}>
          {formatCoords(p.lat, p.lng)}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.postcard, drop, { width }]}>
      <View style={{ width: iw, height: iw / 1.5, overflow: "hidden" }}>
        <Art src={item.image} hue={item.hue} />
      </View>
      <View style={{ position: "absolute", top: 14, right: 14 }}>
        <Stamp hue={item.hue} size={30} />
      </View>
      <View style={styles.postmark}>
        <Text style={mono(fs(7.5, 7), "rgba(28,25,21,0.7)")} numberOfLines={1}>
          {hostOf(item.url)}
        </Text>
      </View>
    </View>
  );
}

/* ── nota: ficha de biblioteca ── */
function NoteCover({ item, width, fs }: CoverProps) {
  const [h, setH] = useState(160);
  const lines = Math.max(0, Math.floor((h - 31) / 24));
  return (
    <View style={[styles.note, drop, { width, transform: [{ rotate: "-0.8deg" }] }]} onLayout={(e) => setH(e.nativeEvent.layout.height)}>
      <View style={[styles.noteMargin]} />
      {Array.from({ length: lines }, (_, i) => (
        <View key={i} style={[styles.noteLine, { top: 31 + 23 + i * 24 }]} />
      ))}
      <View style={styles.noteHole} />
      <Text style={[mono(fs(8.5), "#8a7e6a"), styles.noteDate]}>
        {new Date(item.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
      </Text>
      <Text style={{ fontFamily: fonts.displayItalic, fontSize: Math.min(19, fs(19, 15)), lineHeight: 24, color: INK }} numberOfLines={9}>
        {item.note ?? item.title}
      </Text>
    </View>
  );
}

/* ── link genérico ── */
function LinkCover({ item, width, fs }: CoverProps) {
  const shift = (item.hue / 360) * 1.2;
  return (
    <View style={[styles.link, drop, { width, height: width / 1.6 }]}>
      {item.image ? (
        <Art src={item.image} hue={item.hue} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}>
          <Flare style={{ position: "absolute", top: 0, bottom: 0, width: width * 2.2, left: -width * shift }} />
          <View style={styles.center}>
            <Text style={{ fontFamily: fonts.displayItalic, fontSize: fs(22, 15), color: "rgba(6,5,11,0.8)" }} numberOfLines={1}>
              {hostOf(item.url)}
            </Text>
          </View>
        </View>
      )}
      <View style={styles.linkTag}>
        <Text style={mono(fs(8.5), colors.paper)}>{item.status === "error" ? "sem sinal" : KIND_LABELS[item.kind]}</Text>
      </View>
    </View>
  );
}

const COVERS: Record<CaptureItem["kind"], (p: CoverProps) => React.JSX.Element> = {
  music: MusicCover,
  podcast: PodcastCover,
  book: BookCover,
  video: VideoCover,
  film: FilmCover,
  game: GameCover,
  product: ProductCover,
  article: ArticleCover,
  image: ImageCover,
  code: CodeCover,
  place: PlaceCover,
  social: LinkCover,
  note: NoteCover,
  link: LinkCover,
};

/** Tipos cuja capa já carrega o texto — dispensam legenda. */
export const SELF_CAPTIONED = new Set<CaptureItem["kind"]>(["article", "note", "code"]);

const styles = StyleSheet.create({
  center: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 12 },
  loading: { alignItems: "center", justifyContent: "center", gap: 12, borderRadius: 10, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineStrong, backgroundColor: "rgba(111, 214, 255, 0.04)" },
  loadingOrbit: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.lineStrong },
  loadingDot: { position: "absolute", top: -3, left: 14, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber, shadowColor: colors.amber, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },

  sleeve: { position: "absolute", left: 0, top: 0, zIndex: 2, borderRadius: 3, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.08)" },
  discLabel: { position: "absolute", overflow: "hidden" },
  discHole: { position: "absolute", borderRadius: 999, backgroundColor: colors.void },

  podcast: { alignItems: "center", justifyContent: "center", borderRadius: 10, overflow: "hidden" },
  onAir: { position: "absolute", top: 10, left: 10, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, backgroundColor: colors.ember },

  bookBody: { flex: 1, borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 5, borderBottomRightRadius: 5, overflow: "hidden", backgroundColor: "#111" },
  bookType: { flex: 1, justifyContent: "space-between" },
  bookSpine: { position: "absolute", left: 0, top: 0, bottom: 0 },
  bookPages: { position: "absolute", width: 9, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: "#efe6d2", overflow: "hidden" },

  tv: { padding: 11, paddingBottom: 8, borderRadius: 18 },
  tvScreen: { overflow: "hidden", backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  tvPlay: { position: "absolute", width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingLeft: 2, backgroundColor: "rgba(239,230,210,0.18)", borderWidth: 1, borderColor: "rgba(239,230,210,0.4)" },
  tvPlayOn: { backgroundColor: colors.amber, borderColor: colors.amber, transform: [{ scale: 1.12 }] },
  tvFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 7, paddingHorizontal: 4, gap: 8 },
  knob: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#5a4e3e", borderWidth: 1, borderColor: "#2a241c" },

  film: { paddingTop: 12, paddingHorizontal: 20, paddingBottom: 8, borderRadius: 3, backgroundColor: "#0d0b09", overflow: "hidden" },
  filmStrip: { position: "absolute", top: 4, bottom: 0, width: 20, alignItems: "center" },
  filmHole: { width: 7, height: 6, marginBottom: 8, borderRadius: 1, backgroundColor: "rgba(239,230,210,0.85)" },
  filmEdge: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingTop: 6, opacity: 0.85 },

  cart: { flex: 1, borderTopLeftRadius: 6, borderTopRightRadius: 6, borderBottomLeftRadius: 6, borderBottomRightRadius: 26, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", borderBottomWidth: 4, borderBottomColor: "rgba(0,0,0,0.35)" },
  cartGrip: { position: "absolute", flexDirection: "row", justifyContent: "space-between", overflow: "hidden" },
  cartRib: { width: 2, height: "100%", backgroundColor: "rgba(0,0,0,0.32)" },
  cartLabel: { flex: 1, padding: 5, paddingBottom: 0, borderRadius: 4, overflow: "hidden", backgroundColor: PAPER },
  cartArt: { flex: 1, borderRadius: 2, overflow: "hidden" },
  cartTitle: { position: "absolute", left: 10, right: 10, bottom: 10, fontFamily: fonts.display, color: colors.paper, textShadowColor: "rgba(0,0,0,0.5)", textShadowRadius: 10 },
  cartBand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", height: 18, paddingHorizontal: 2, gap: 6 },
  cartArrow: { position: "absolute", alignSelf: "center", fontSize: 9, color: "rgba(0,0,0,0.35)" },

  product: { padding: 12, paddingBottom: 14, borderRadius: 3, overflow: "visible", backgroundColor: PAPER },
  bag: { height: "100%", alignSelf: "center", justifyContent: "flex-end" },
  bagHandle: { position: "absolute", left: "30%", right: "30%", top: "6%", borderWidth: 3, borderBottomWidth: 0, borderColor: "#8c6a43", borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  bagBody: { height: "76%", alignItems: "center", justifyContent: "center", padding: 12, borderRadius: 3 },
  bagStore: { fontFamily: fonts.displayItalic, textAlign: "center", color: "#3d2a14" },
  tag: { position: "absolute", top: 18, right: -10, minWidth: 92, alignItems: "flex-end", paddingVertical: 7, paddingLeft: 24, paddingRight: 12, shadowColor: "#000", shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  tagString: { position: "absolute", left: -38, top: "50%", width: 50, height: 1, backgroundColor: "rgba(255,180,61,0.6)", transform: [{ rotate: "-24deg" }] },
  tagHole: { position: "absolute", left: 9, top: "50%", marginTop: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: "#6b5d48" },
  tagPrice: { fontFamily: fonts.display, color: "#b2410f" },
  tagSold: { fontFamily: fonts.displayItalic, color: "#6b5d48", textDecorationLine: "line-through" },

  article: { borderRadius: 2, backgroundColor: PAPER, overflow: "hidden" },
  mast: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingBottom: 6 },
  mastRule: { height: 1, backgroundColor: INK },

  print: { padding: 9, paddingBottom: 0, borderRadius: 2, backgroundColor: PAPER },
  plate: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingTop: 8, paddingBottom: 9, paddingHorizontal: 2 },

  term: { borderRadius: 10, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,180,61,0.2)", backgroundColor: "#080705" },
  termBar: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: "rgba(255,180,61,0.14)" },
  termDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,180,61,0.35)" },

  postcard: { padding: 8, borderRadius: 2, backgroundColor: PAPER },
  stamp: { alignItems: "center", justifyContent: "center", borderWidth: 2.5, borderStyle: "dotted", borderColor: PAPER },
  postmark: { position: "absolute", bottom: 18, right: 18, maxWidth: "60%", paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1.5, borderColor: "rgba(28,25,21,0.55)", borderRadius: 999, backgroundColor: "rgba(236,226,203,0.5)", transform: [{ rotate: "-12deg" }] },
  coords: { position: "absolute", left: 10, right: 10, bottom: 7 },
  pinWrap: { position: "absolute", width: 14, height: 14 },
  pin: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: PAPER, shadowColor: colors.ember, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  pinRing: { position: "absolute", inset: -2, borderRadius: 999, borderWidth: 2, borderColor: colors.ember },

  note: { minHeight: 150, paddingTop: 30, paddingRight: 18, paddingBottom: 34, paddingLeft: 26, borderRadius: 2, backgroundColor: "#efe6d2" },
  noteMargin: { position: "absolute", left: 0, right: 0, top: 26, height: 1, backgroundColor: "rgba(212,42,106,0.45)" },
  noteLine: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(42,75,255,0.16)" },
  noteHole: { position: "absolute", bottom: 10, alignSelf: "center", left: "50%", marginLeft: -6, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.void },
  noteDate: { position: "absolute", top: 8, right: 12 },

  link: { borderRadius: 10, overflow: "hidden", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: colors.nebula },
  linkTag: { position: "absolute", left: 8, bottom: 8, paddingVertical: 3, paddingHorizontal: 7, borderRadius: 4, backgroundColor: "rgba(6,5,11,0.72)" },
});


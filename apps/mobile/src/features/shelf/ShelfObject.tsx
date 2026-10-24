import { memo, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSpring, withTiming } from "react-native-reanimated";
import Svg, { Polygon } from "react-native-svg";
import type { Creation } from "@myndshelf/types";
import { codeLanguageOf } from "@myndshelf/core";
import { HueFallback } from "../../components/Art";
import { colors, fonts, hsl } from "../../lib/theme";
import { useSpin } from "../capture/covers/parts";

const PAPER = "#ece2cb";
const INK = "#1c1915";
const shadow = { shadowColor: "#000", shadowOpacity: 0.8, shadowRadius: 12, shadowOffset: { width: 0, height: 12 }, elevation: 8 } as const;
const mono = (size: number, color: string) => ({ fontFamily: fonts.mono, fontSize: size, letterSpacing: 0.6, textTransform: "uppercase" as const, color });

type P = { item: Creation; active?: boolean };

/**
 * A criação como objeto físico — contra a "não-coisa" digital (Byung-Chul Han):
 * imagem vira quadro, documento vira livro, áudio vira fita, vídeo vira VHS,
 * texto vira manuscrito, código vira disquete e o resto vai para uma redoma.
 * `scale` aumenta o objeto inteiro (detalhe, vitrine).
 */
export const ShelfObject = memo(function ShelfObject({ item, active, scale = 1 }: P & { scale?: number }) {
  const O = OBJECTS[item.medium] ?? Jar;
  return (
    <View style={scale !== 1 ? { transform: [{ scale }], margin: (scale - 1) * 60 } : undefined}>
      <O item={item} active={active} />
    </View>
  );
});

function Frame({ item }: P) {
  const [ratio, setRatio] = useState(0.78);
  const h = 128;
  const w = Math.min(200, Math.max(80, h * ratio));
  return (
    <LinearGradient colors={["#d9b878", "#8a6631", "#c9a05a", "#6b4d22"]} locations={[0, 0.4, 0.7, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ padding: 6 }, shadow]}>
      <View style={{ padding: 12, backgroundColor: PAPER }}>
        {item.preview ? (
          <Image source={{ uri: item.preview }} style={{ width: w, height: h }} contentFit="cover" onLoad={(e) => e.source.width && setRatio(e.source.width / e.source.height)} />
        ) : (
          <HueFallback hue={item.hue} style={{ width: 100, height: h }} />
        )}
      </View>
    </LinearGradient>
  );
}

function Tome({ item }: P) {
  if (item.preview)
    return (
      // PDF/imagem: a primeira página vira a capa do livro
      <View style={[styles.tome, shadow, { padding: 0, backgroundColor: "#fbf7ee" }]}>
        <Image source={{ uri: item.preview }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
        <LinearGradient colors={["rgba(0,0,0,0.45)", "rgba(255,255,255,0.25)", "rgba(0,0,0,0.15)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tomeSpine} />
      </View>
    );
  return (
    <View style={[styles.tome, shadow, { backgroundColor: hsl(item.hue, 50, 32) }]}>
      <View style={styles.tomeEdge} />
      <View style={styles.tomeBand} />
      <Text style={styles.tomeTitle} numberOfLines={4}>
        {item.title}
      </Text>
      <Text style={[mono(8.5, colors.paper), { opacity: 0.7 }]}>{item.year}</Text>
    </View>
  );
}

function Reel({ active }: { active?: boolean }) {
  const spin = useSpin(2400, !!active);
  return (
    <Animated.View style={[styles.reel, spin]}>
      {[0, 120, 240].map((r) => (
        <View key={r} style={[styles.spoke, { transform: [{ rotate: `${r}deg` }, { translateY: -5 }] }]} />
      ))}
    </Animated.View>
  );
}

function Tape({ item, active }: P) {
  return (
    <LinearGradient colors={["#2a2530", "#121016"]} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={[styles.tape, shadow]}>
      <View style={styles.tapeLabel}>
        <Text style={mono(7, "#8a7e6a")}>Lado A</Text>
        <Text style={styles.tapeTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={[styles.tapeStripe, { backgroundColor: hsl(item.hue + 40, 80, 60) }]} />
      </View>
      <View style={styles.tapeWindow}>
        <Reel active={active} />
        <Reel active={active} />
      </View>
    </LinearGradient>
  );
}

function Vhs({ item }: P) {
  return (
    <LinearGradient colors={["#1d1b20", "#09080b"]} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }} style={[styles.vhs, shadow]}>
      {item.preview ? <Image source={{ uri: item.preview }} style={styles.vhsShot} contentFit="cover" /> : <HueFallback hue={item.hue} style={[styles.vhsShot, { opacity: 0.6 }]} />}
      <View style={styles.vhsLabel}>
        <Text style={styles.vhsTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={mono(7, colors.ember)}>VHS · {item.year}</Text>
      </View>
    </LinearGradient>
  );
}

function Manuscript({ item }: P) {
  return (
    <View style={{ width: 118, height: 152 }}>
      <View style={[styles.sheet, shadow, { backgroundColor: "#d9cdb2", transform: [{ rotate: "-5deg" }, { translateX: -4 }, { translateY: 2 }] }]} />
      <View style={[styles.sheet, { backgroundColor: "#e2d7bd", transform: [{ rotate: "3deg" }, { translateX: 3 }, { translateY: 1 }] }]} />
      <View style={[styles.sheet, { padding: 12, paddingTop: 14 }]}>
        <Text style={styles.msTitle} numberOfLines={3}>
          {item.title}
        </Text>
        {Array.from({ length: 8 }, (_, i) => (
          <View key={i} style={styles.msLine} />
        ))}
      </View>
    </View>
  );
}

function Floppy({ item, active }: P) {
  const lang = codeLanguageOf(item.fileName);
  const shutter = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(active ? 30 : 0, { damping: 14 }) }] }));
  return (
    <View style={[{ width: 126, height: 130 }, shadow]}>
      {/* canto chanfrado, como nos disquetes de verdade */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 126 130">
        <Polygon points="0,0 115,0 126,11 126,130 0,130" fill={lang.color} />
        <Polygon points="0,0 115,0 126,11 126,130 0,130" fill="rgba(10,8,14,0.38)" />
      </Svg>
      <View style={styles.floppyWindow}>
        <View style={styles.floppyDisk} />
        <Animated.View style={[styles.floppyShutter, shutter]}>
          <View style={styles.floppySlot} />
        </Animated.View>
      </View>
      <View style={styles.floppyLabel}>
        <View style={[styles.floppyLang, { backgroundColor: lang.color }]}>
          <Text style={mono(7, "rgba(255,255,255,0.92)")}>{lang.name}</Text>
          {lang.ext ? <Text style={[mono(7, "rgba(255,255,255,0.92)"), { textTransform: "lowercase", fontFamily: fonts.monoBold }]}>.{lang.ext}</Text> : null}
        </View>
        <Text style={styles.floppyTitle} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
      <View style={styles.floppyNotch} />
    </View>
  );
}

function Folder({ item }: P) {
  const n = item.folder?.items ?? 0;
  return (
    <View style={{ width: 150, height: 118 }}>
      <View style={[styles.folderBack, shadow, { backgroundColor: hsl(item.hue, 35, 38) }]}>
        <View style={[styles.folderTab, { backgroundColor: hsl(item.hue, 35, 38) }]}>
          <Text style={mono(7, "rgba(239,230,210,0.8)")} numberOfLines={1}>
            {item.fileName}
          </Text>
        </View>
      </View>
      <View style={[styles.folderPaper, { transform: [{ rotate: "-3deg" }] }]} />
      <View style={[styles.folderPaper, { left: 22, transform: [{ rotate: "2deg" }] }]} />
      <LinearGradient colors={[hsl(item.hue, 40, 48), hsl(item.hue, 40, 34)]} style={styles.folderFront}>
        <Text style={styles.folderTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.stamp}>
          <Text style={mono(7, colors.amber)}>
            {n} {n === 1 ? "item" : "itens"}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );
}

function Jar({ item }: P) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-8, { duration: 2500, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [y]);
  const float = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <View style={{ alignItems: "center" }}>
      <View style={styles.glass}>
        <LinearGradient colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0)", "rgba(255,255,255,0)", "rgba(255,255,255,0.08)"]} locations={[0, 0.22, 0.8, 0.95]} start={{ x: 0, y: 0.4 }} end={{ x: 1, y: 0.6 }} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.glow, float]}>
          <LinearGradient colors={[colors.sun, hsl(item.hue + 40, 80, 60), hsl(item.hue, 50, 32)]} start={{ x: 0.3, y: 0.3 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { borderRadius: 22 }]} />
        </Animated.View>
      </View>
      <LinearGradient colors={["#3a2e22", "#1a140e"]} style={styles.jarBase}>
        <Text style={[mono(8, colors.amber), { textAlign: "center" }]}>{item.fileName?.split(".").pop() ?? "obj"}</Text>
      </LinearGradient>
    </View>
  );
}

const OBJECTS: Record<Creation["medium"], (p: P) => React.JSX.Element> = {
  image: Frame,
  document: Tome,
  audio: Tape,
  video: Vhs,
  text: Manuscript,
  code: Floppy,
  folder: Folder,
  object: Jar,
};

const styles = StyleSheet.create({
  tome: { width: 112, height: 160, padding: 12, paddingLeft: 18, paddingTop: 18, justifyContent: "space-between", borderTopLeftRadius: 2, borderBottomLeftRadius: 2, borderTopRightRadius: 6, borderBottomRightRadius: 6, overflow: "hidden" },
  tomeEdge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: "rgba(0,0,0,0.4)", borderRightWidth: 2, borderRightColor: "rgba(255,255,255,0.15)" },
  tomeSpine: { position: "absolute", left: 0, top: 0, bottom: 0, width: 9 },
  tomeBand: { position: "absolute", left: 8, right: 0, top: "64%", height: 7, backgroundColor: colors.amber, opacity: 0.8 },
  tomeTitle: { fontFamily: fonts.display, fontSize: 17, lineHeight: 18, color: colors.paper },

  tape: { width: 176, height: 112, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8 },
  tapeLabel: { height: 44, paddingVertical: 5, paddingHorizontal: 8, borderRadius: 3, backgroundColor: PAPER, overflow: "hidden" },
  tapeTitle: { fontFamily: fonts.displayItalic, fontSize: 14, color: INK },
  tapeStripe: { position: "absolute", left: 0, right: 0, bottom: 6, height: 3 },
  tapeWindow: { flexDirection: "row", justifyContent: "space-between", alignSelf: "center", width: 98, marginTop: 10, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(239,230,210,0.08)", borderWidth: 1, borderColor: "rgba(239,230,210,0.12)" },
  reel: { width: 22, height: 22, borderRadius: 11, borderWidth: 5, borderColor: "#3a3440", alignItems: "center", justifyContent: "center" },
  spoke: { position: "absolute", width: 2, height: 6, backgroundColor: PAPER },

  vhs: { width: 184, height: 108, borderRadius: 3, overflow: "hidden" },
  vhsShot: { position: "absolute", left: 8, right: 8, top: 8, height: 54, opacity: 0.85 },
  vhsLabel: { position: "absolute", left: 8, right: 8, bottom: 8, paddingVertical: 4, paddingHorizontal: 7, backgroundColor: PAPER },
  vhsTitle: { fontFamily: fonts.display, fontSize: 13, color: INK },

  sheet: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: PAPER, borderRadius: 1 },
  msTitle: { fontFamily: fonts.display, fontSize: 15, lineHeight: 16, color: INK, marginBottom: 10 },
  msLine: { height: 1, marginBottom: 8, backgroundColor: "rgba(28,25,21,0.18)" },

  floppyWindow: { width: "64%", height: 40, alignSelf: "center", marginBottom: 8, overflow: "hidden", borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  floppyDisk: { position: "absolute", top: 5, bottom: 6, left: "26%", right: "26%", borderRadius: 2, backgroundColor: "#2a1e16" },
  floppyShutter: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#b9bbc3", borderBottomLeftRadius: 3, borderBottomRightRadius: 3, alignItems: "center" },
  floppySlot: { marginTop: 6, width: "22%", height: 26, borderRadius: 2, backgroundColor: "#7a7c85" },
  floppyLabel: { height: 66, marginHorizontal: 12, paddingHorizontal: 7, paddingBottom: 5, overflow: "hidden", borderRadius: 2, backgroundColor: "#efe6d2" },
  floppyLang: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: -7, marginBottom: 4, paddingVertical: 3, paddingHorizontal: 7 },
  floppyTitle: { fontFamily: fonts.displayItalic, fontSize: 14, lineHeight: 15, color: INK },
  floppyNotch: { position: "absolute", right: 6, bottom: 6, width: 8, height: 8, backgroundColor: "rgba(0,0,0,0.5)" },

  folderBack: { position: "absolute", left: 0, right: 0, top: 12, bottom: 0, borderRadius: 4 },
  folderTab: { position: "absolute", top: -12, left: 0, width: 70, height: 16, paddingHorizontal: 6, justifyContent: "center", borderTopLeftRadius: 4, borderTopRightRadius: 6 },
  folderPaper: { position: "absolute", left: 12, right: 18, top: 18, height: 70, backgroundColor: PAPER, borderRadius: 1 },
  folderFront: { position: "absolute", left: 0, right: 0, top: 40, bottom: 0, padding: 10, borderRadius: 4, justifyContent: "space-between" },
  folderTitle: { fontFamily: fonts.display, fontSize: 15, lineHeight: 16, color: colors.paper },
  stamp: { alignSelf: "flex-end", paddingVertical: 2, paddingHorizontal: 5, borderWidth: 1, borderColor: colors.amber, borderRadius: 3, transform: [{ rotate: "-6deg" }] },

  glass: { width: 104, height: 128, borderTopLeftRadius: 52, borderTopRightRadius: 52, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, overflow: "hidden", backgroundColor: "rgba(170,210,255,0.05)", borderWidth: 1, borderColor: "rgba(200,230,255,0.3)", alignItems: "center", justifyContent: "flex-end" },
  glow: { width: 44, height: 44, marginBottom: 22, borderRadius: 22, shadowColor: colors.cyan, shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  jarBase: { width: 124, paddingVertical: 6, borderRadius: 3 },
});

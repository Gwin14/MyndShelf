import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { EASE, SLOW } from "../../lib/motion";
import { BookOpen, Expand, MapPin, MessageCircle, Play } from "lucide-react-native";
import { VIEW_LABELS, viewModeOf, type ViewMode } from "@myndshelf/core";
import type { CaptureItem } from "@myndshelf/types";
import { Touch } from "../../components/Touch";
import { useGlow } from "../../lib/ai";
import { captureMenu } from "../../lib/menus";
import { openSheet } from "../../lib/sheet";
import { colors, fonts } from "../../lib/theme";
import { Cover, SELF_CAPTIONED } from "./covers/Cover";

const ICON = 11;
const VIEW_ICONS: Record<ViewMode, React.JSX.Element> = {
  play: <Play size={ICON} color={colors.paper} fill={colors.paper} />,
  read: <BookOpen size={ICON} color={colors.paper} />,
  image: <Expand size={ICON} color={colors.paper} />,
  map: <MapPin size={ICON} color={colors.paper} />,
  post: <MessageCircle size={ICON} color={colors.paper} />,
};

export const CaptureCard = memo(function CaptureCard({ item, index, width }: { item: CaptureItem; index: number; width: number }) {
  const mode = item.status === "ready" ? viewModeOf(item) : undefined;
  const working = useGlow((s) => !!s.working[item.id]);
  const glow = useGlow((s) => !!s.fresh[`${item.id}:card`]);

  // a IA lendo o item: o card respira
  const breath = useSharedValue(1);
  useEffect(() => {
    if (working) breath.value = withRepeat(withTiming(0.55, { duration: 900 }), -1, true);
    else {
      cancelAnimation(breath);
      breath.value = withTiming(1);
    }
  }, [working, breath]);
  const breathe = useAnimatedStyle(() => ({ opacity: breath.value }));

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 40).duration(SLOW).easing(EASE)}>
      <Touch
        onPress={() => router.push(`/capture/${item.id}`)}
        onLongPress={() => openSheet(captureMenu(item), item.title)}
        delayLongPress={320}
        scale={0.97}
        style={[styles.card, glow && styles.glow]}
      >
        <Animated.View style={breathe}>
          <Cover item={item} width={width} />
        </Animated.View>
        {mode && (
          <Touch onPress={() => router.push(`/view/${item.id}`)} hitSlop={8} style={styles.open}>
            {VIEW_ICONS[mode]}
            <Text style={styles.openLabel}>{VIEW_LABELS[mode]}</Text>
          </Touch>
        )}
        {!SELF_CAPTIONED.has(item.kind) && item.status !== "loading" && (
          <View style={styles.cap}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.meta}>
              {item.favicon ? <Image source={{ uri: item.favicon }} style={styles.favicon} /> : null}
              <Text style={styles.metaText} numberOfLines={1}>
                {item.author && item.kind !== "link" ? item.author : item.siteName}
              </Text>
            </View>
          </View>
        )}
      </Touch>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: 12 },
  glow: { shadowColor: colors.amber, shadowOpacity: 0.7, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  open: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: "rgba(6, 5, 11, 0.72)",
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  openLabel: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: colors.paper },
  cap: { paddingTop: 10, paddingHorizontal: 2 },
  title: { fontFamily: fonts.display, fontSize: 17, lineHeight: 18.5, color: colors.paper },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 5 },
  favicon: { width: 11, height: 11, borderRadius: 3, opacity: 0.8 },
  metaText: { flexShrink: 1, fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.7, textTransform: "uppercase", color: colors.paperMute },
});

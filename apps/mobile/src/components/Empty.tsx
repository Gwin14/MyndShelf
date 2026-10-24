import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors, fonts } from "../lib/theme";

/** Órbita vazia: um sol pequeno e um satélite ciano dando voltas. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(360, { duration: 6000, easing: Easing.linear }), -1);
  }, [turn]);
  const orbit = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <View style={styles.wrap}>
      <View style={styles.orbit}>
        <LinearGradient colors={[colors.sun, colors.amber, colors.ember]} start={{ x: 0.2, y: 0.2 }} end={{ x: 0.9, y: 0.9 }} style={styles.sun} />
        <Animated.View style={[StyleSheet.absoluteFill, orbit]}>
          <View style={styles.moon} />
        </Animated.View>
      </View>
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 64, paddingHorizontal: 24 },
  orbit: { width: 86, height: 86, borderRadius: 43, borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineStrong, alignItems: "center", justifyContent: "center" },
  sun: { width: 26, height: 26, borderRadius: 13, shadowColor: colors.amber, shadowOpacity: 0.6, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  moon: { position: "absolute", top: -3, left: 40, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  title: { fontFamily: fonts.displayItalic, fontSize: 28, color: colors.paperDim, marginTop: 16, marginBottom: 6, textAlign: "center" },
  hint: { fontFamily: fonts.body, fontSize: 14, color: colors.paperMute, textAlign: "center", lineHeight: 20 },
});

import { useState } from "react";
import { Image, StyleSheet } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";
import { EASE } from "../lib/motion";
import { colors } from "../lib/theme";

/** Mesma largura do `imageWidth` da splash no app.json: a troca é invisível. */
const WIDTH = 230;
const ART = require("../../assets/splash/splash.png");

/**
 * Continuação da splash nativa: começa idêntica a ela e se dissolve no céu —
 * o fundo some, a estrela sobe um pouco e apaga.
 */
export function Intro() {
  const [done, setDone] = useState(false);
  const sky = useSharedValue(1);
  const art = useSharedValue(1);

  const start = () => {
    // a camada já está na tela, igual à nativa: pode esconder sem piscar
    void SplashScreen.hideAsync();
    art.value = withDelay(220, withTiming(0, { duration: 620, easing: EASE }));
    sky.value = withDelay(320, withTiming(0, { duration: 760, easing: EASE }, (finished) => finished && runOnJS(setDone)(true)));
  };

  const skyStyle = useAnimatedStyle(() => ({ opacity: sky.value }));
  const artStyle = useAnimatedStyle(() => ({
    opacity: art.value,
    transform: [{ translateY: (1 - art.value) * -18 }, { scale: 1 + (1 - art.value) * 0.05 }],
  }));

  if (done) return null;
  return (
    <Animated.View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.sky, skyStyle]} />
      <Animated.View style={[styles.center, artStyle]}>
        <Image source={ART} style={styles.art} onLoad={start} fadeDuration={0} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sky: { backgroundColor: colors.void },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  art: { width: WIDTH, height: (WIDTH * 600) / 690 },
});

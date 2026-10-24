import { useEffect, useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Canvas, Circle, ColorMatrix, FractalNoise, Group, Path, RadialGradient, Rect, Skia, vec } from "@shopify/react-native-skia";
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useCosmos } from "../lib/cosmos";

const STAR_COLORS = ["255, 248, 235", "170, 210, 255", "255, 214, 160"];
const ALPHAS = [0.3, 0.5, 0.7, 0.85];

/** Céu de fundo: estrelas determinísticas (o céu não "pula"), nebulosas, faíscas de quatro pontas e grão de filme. */
export function Cosmos() {
  const { width: w, height: h } = useWindowDimensions();
  const shift = useCosmos((s) => s.shift);

  const { stars, sparkles } = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    // um balde por cor × opacidade: poucos caminhos, muitas estrelas
    const buckets = STAR_COLORS.flatMap((color) => ALPHAS.map((a) => ({ color: `rgba(${color}, ${a})`, builder: Skia.PathBuilder.Make() })));
    const count = Math.round((w * h) / 2200);
    for (let i = 0; i < count; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = rnd() ** 3 * 1.3 + 0.25;
      const warm = rnd();
      const c = warm > 0.85 ? 2 : warm > 0.7 ? 1 : 0;
      const a = Math.min(ALPHAS.length - 1, Math.floor(rnd() * ALPHAS.length));
      buckets[c * ALPHAS.length + a].builder.addCircle(x, y, r);
    }
    const sparkles = Array.from({ length: Math.max(3, Math.round(count / 70)) }, () => {
      const x = rnd() * w;
      const y = rnd() * h;
      const s = 3 + rnd() * 6;
      const path = Skia.PathBuilder.Make()
        .moveTo(x, y - s * 1.6)
        .quadTo(x, y, x + s, y)
        .quadTo(x, y, x, y + s * 1.6)
        .quadTo(x, y, x - s, y)
        .quadTo(x, y, x, y - s * 1.6)
        .detach();
      return { x, y, s, path };
    });
    return { stars: buckets.map((b) => ({ color: b.color, path: b.builder.detach() })), sparkles };
  }, [w, h]);

  const twinkle = useSharedValue(1);
  const tx = useSharedValue(0);
  useEffect(() => {
    twinkle.value = withRepeat(withTiming(0.15, { duration: 5000, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [twinkle]);
  useEffect(() => {
    tx.value = withTiming(shift * w * 0.05, { duration: 1600, easing: Easing.bezier(0.22, 1, 0.36, 1) });
  }, [shift, w, tx]);
  const nebula = useDerivedValue(() => [{ translateX: tx.value }]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect x={0} y={0} width={w} height={h} color="#06050b" />
      <Group transform={nebula}>
        <Rect x={-w * 0.2} y={-h * 0.1} width={w * 1.4} height={h * 1.2}>
          <RadialGradient c={vec(w * 0.12, h * 0.16)} r={w * 0.75} colors={["rgba(42, 75, 255, 0.2)", "rgba(42, 75, 255, 0)"]} />
        </Rect>
        <Rect x={-w * 0.2} y={-h * 0.1} width={w * 1.4} height={h * 1.2}>
          <RadialGradient c={vec(w * 0.92, h * 0.78)} r={w * 0.7} colors={["rgba(212, 42, 106, 0.15)", "rgba(212, 42, 106, 0)"]} />
        </Rect>
        <Rect x={-w * 0.2} y={-h * 0.1} width={w * 1.4} height={h * 1.2}>
          <RadialGradient c={vec(w * 0.8, h * 0.08)} r={w * 0.55} colors={["rgba(255, 180, 61, 0.09)", "rgba(255, 180, 61, 0)"]} />
        </Rect>
        <Rect x={-w * 0.2} y={-h * 0.1} width={w * 1.4} height={h * 1.2}>
          <RadialGradient c={vec(w * 0.5, h * 1.1)} r={w} colors={["rgba(111, 214, 255, 0.12)", "rgba(111, 214, 255, 0)"]} />
        </Rect>
      </Group>
      {stars.map((b, i) => (
        <Path key={i} path={b.path} color={b.color} />
      ))}
      {sparkles.map((s, i) => (
        <Path key={`s${i}`} path={s.path}>
          <RadialGradient c={vec(s.x, s.y)} r={s.s * 1.6} colors={["rgba(255, 244, 214, 0.9)", "rgba(255, 244, 214, 0)"]} />
        </Path>
      ))}
      <Group opacity={twinkle}>
        <Circle cx={w * 0.2} cy={h * 0.3} r={1.4} color="#fff8e6" />
        <Circle cx={w * 0.7} cy={h * 0.64} r={1.2} color="#cfe6ff" />
        <Circle cx={w * 0.44} cy={h * 0.82} r={1.6} color="#ffe0b0" />
        <Circle cx={w * 0.86} cy={h * 0.22} r={1.2} color="#ffffff" />
        <Circle cx={w * 0.1} cy={h * 0.7} r={1.3} color="#fff8e6" />
      </Group>
      {/* grão de filme — a textura de impressão antiga das referências */}
      <Rect x={0} y={0} width={w} height={h} opacity={0.07} blendMode="overlay">
        <FractalNoise freqX={0.85} freqY={0.85} octaves={3} />
        <ColorMatrix matrix={[0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1.2, 0]} />
      </Rect>
    </Canvas>
  );
}

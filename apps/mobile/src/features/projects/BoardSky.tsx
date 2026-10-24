import { useEffect, useMemo } from "react";
import { StyleSheet } from "react-native";
import { BlurMask, Canvas, DashPathEffect, Fill, Group, LinearGradient, Path, Shader, Skia, vec } from "@shopify/react-native-skia";
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming, type SharedValue } from "react-native-reanimated";
import { colors } from "../../lib/theme";

/** Grade de pontos do desktop (32px no zoom 1), desenhada na GPU e presa à câmera. */
const DOTS = Skia.RuntimeEffect.Make(`
uniform float2 offset;
uniform float size;
uniform float alpha;
half4 main(float2 p) {
  float2 q = mod(p - offset, size) - size * 0.5;
  float a = (1.0 - smoothstep(0.7, 1.25, length(q))) * alpha;
  return half4(0.937 * a, 0.902 * a, 0.824 * a, a);
}`)!;

export type Edge = { id: string; a: { x: number; y: number }; b: { x: number; y: number }; lit: boolean };

/** Curva como a do desktop: sai e chega na horizontal. */
export function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const c = Math.max(40, Math.abs(dx) * 0.45) * Math.sign(dx || 1);
  return `M ${a.x} ${a.y} C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`;
}

/** Ponto do meio da curva (t = 0.5) — onde fica o botão de desligar. */
export function curveMid(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const c = Math.max(40, Math.abs(dx) * 0.45) * Math.sign(dx || 1);
  return { x: (a.x + 3 * (a.x + c) + 3 * (b.x - c) + b.x) / 8, y: (a.y + b.y) / 2 };
}

const STOPS = [colors.cyan, colors.sun, colors.amber, colors.ember];
const POS = [0, 0.45, 0.7, 1];

/** Fundo do quadro: pontos + ligações com gradiente e brilho, sob os objetos. */
export function BoardSky({ tx, ty, zoom, edges }: { tx: SharedValue<number>; ty: SharedValue<number>; zoom: SharedValue<number>; edges: Edge[] }) {
  const uniforms = useDerivedValue(() => {
    const size = 32 * zoom.value;
    return { offset: [tx.value, ty.value], size, alpha: Math.min(0.16, 0.06 + zoom.value * 0.1) };
  });
  const camera = useDerivedValue(() => [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }]);

  // tracejado correndo nas ligações do objeto selecionado
  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(withTiming(-11, { duration: 800, easing: Easing.linear }), -1);
  }, [phase]);

  const paths = useMemo(() => edges.map((e) => ({ ...e, path: Skia.Path.MakeFromSVGString(curve(e.a, e.b))! })), [edges]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Fill>
        <Shader source={DOTS} uniforms={uniforms} />
      </Fill>
      <Group transform={camera}>
        {paths.map((e) => (
          <Group key={e.id}>
            <Path path={e.path} style="stroke" strokeWidth={e.lit ? 7 : 5} opacity={0.45} strokeCap="round">
              <LinearGradient start={vec(e.a.x, e.a.y)} end={vec(e.b.x, e.b.y)} colors={STOPS} positions={POS} />
              <BlurMask blur={4} style="normal" />
            </Path>
            <Path path={e.path} style="stroke" strokeWidth={e.lit ? 2.4 : 1.6} strokeCap="round">
              <LinearGradient start={vec(e.a.x, e.a.y)} end={vec(e.b.x, e.b.y)} colors={STOPS} positions={POS} />
              {e.lit && <DashPathEffect intervals={[6, 5]} phase={phase} />}
            </Path>
          </Group>
        ))}
      </Group>
    </Canvas>
  );
}

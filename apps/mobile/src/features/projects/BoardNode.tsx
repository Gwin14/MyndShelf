import { memo, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { GestureDetector, usePanGesture, useTapGesture, useLongPressGesture, useExclusiveGestures, type PanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue, } from "react-native-reanimated";
import { FAST, smooth } from "../../lib/motion";
import { scheduleOnRN } from "react-native-worklets";
import type { BoardNode } from "@myndshelf/types";
import { useLibrary } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";
import { Cover, SELF_CAPTIONED } from "../capture/covers/Cover";
import { ShelfObject } from "../shelf/ShelfObject";
import { WORLD } from "../../lib/board";

type Props = {
  node: BoardNode;
  zoom: { value: number };
  selected: boolean;
  linking: boolean;
  /** gestos do fundo — o arrasto do nó ganha deles */
  canvas: PanGesture;
  onTap(id: string): void;
  onLongPress(id: string): void;
  onDrag(id: string, dx: number, dy: number): void;
  onDrop(id: string, dx: number, dy: number): void;
  onMeasure(id: string, w: number, h: number): void;
};

/** Um objeto no quadro: arrastar move, tocar seleciona, segurar abre as ações. */
export const BoardNodeView = memo(function BoardNodeView({ node, zoom, selected, linking, canvas, onTap, onLongPress, onDrag, onDrop, onMeasure }: Props) {
  const capture = useLibrary((s) => (node.kind === "capture" ? s.captures.find((c) => c.id === node.refId) : undefined));
  const creation = useLibrary((s) => (node.kind === "creation" ? s.creations.find((c) => c.id === node.refId) : undefined));
  const dx = useSharedValue(0);
  const dy = useSharedValue(0);
  const lift = useSharedValue(0);

  // a posição salva já inclui o arrasto: o deslocamento local volta a zero quando a store atualiza
  useEffect(() => {
    dx.value = 0;
    dy.value = 0;
  }, [node.x, node.y, dx, dy]);

  const pan = usePanGesture({
    minDistance: 6,
    block: canvas,
    onActivate: () => {
      lift.value = smooth(1, FAST);
    },
    onUpdate: (e) => {
      dx.value = e.translationX / zoom.value;
      dy.value = e.translationY / zoom.value;
      scheduleOnRN(onDrag, node.id, dx.value, dy.value);
    },
    onDeactivate: () => {
      lift.value = smooth(0, FAST);
      scheduleOnRN(onDrop, node.id, dx.value, dy.value);
    },
  });
  const tap = useTapGesture({ onDeactivate: (e) => !e.canceled && scheduleOnRN(onTap, node.id) });
  const hold = useLongPressGesture({ minDuration: 380, onActivate: () => scheduleOnRN(onLongPress, node.id) });
  const gesture = useExclusiveGestures(pan, hold, tap);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: dx.value }, { translateY: dy.value }, { rotate: `${node.rotation * (1 - lift.value)}deg` }, { scale: 1 + lift.value * 0.04 }],
    zIndex: lift.value > 0.01 ? 100 : 1,
    shadowOpacity: 0.4 + lift.value * 0.4,
  }));

  if (node.kind !== "text" && !capture && !creation) return null;

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        onLayout={(e) => onMeasure(node.id, e.nativeEvent.layout.width, e.nativeEvent.layout.height)}
        style={[styles.node, { left: node.x + WORLD, top: node.y + WORLD, width: node.w }, selected && styles.selected, linking && styles.linking, style]}
      >
        {capture && (
          <View>
            <Cover item={capture} width={node.w - 16} />
            {!SELF_CAPTIONED.has(capture.kind) && (
              <Text style={styles.caption} numberOfLines={2}>
                {capture.title}
              </Text>
            )}
          </View>
        )}
        {creation && (
          <View style={styles.creation}>
            <ShelfObject item={creation} />
            <Text style={styles.caption} numberOfLines={2}>
              {creation.title}
            </Text>
          </View>
        )}
        {node.kind === "text" && <Text style={styles.text}>{node.text || "…"}</Text>}
        <View style={styles.port}>
          <Text style={styles.portStar}>✦</Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  node: {
    position: "absolute",
    padding: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
  },
  selected: { borderColor: "rgba(255,180,61,0.7)", backgroundColor: "rgba(255,180,61,0.06)" },
  linking: { borderColor: colors.cyan, borderStyle: "dashed" },
  creation: { alignItems: "center", paddingTop: 10 },
  caption: { fontFamily: fonts.display, fontSize: 16, lineHeight: 17, color: colors.paper, marginTop: 10, textAlign: "center" },
  text: {
    padding: 16,
    borderRadius: 3,
    backgroundColor: "#f3dd8a",
    fontFamily: fonts.displayItalic,
    fontSize: 20,
    lineHeight: 24,
    color: "#2a2210",
    overflow: "hidden",
  },
  port: { position: "absolute", right: -8, top: "45%", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: colors.night, borderWidth: 1, borderColor: colors.lineStrong },
  portStar: { color: colors.amber, fontSize: 11 },
});

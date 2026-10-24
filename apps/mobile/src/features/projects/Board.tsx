import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { GestureDetector, useCompetingGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import Svg, { Line } from "react-native-svg";
import { BookOpen, Link2, Pencil, Trash2, Unlink, X } from "lucide-react-native";
import type { Project } from "@myndshelf/types";
import { Touch } from "../../components/Touch";
import { press, success, tap } from "../../lib/haptics";
import { WORLD } from "../../lib/board";
import { BASE, EASE } from "../../lib/motion";
import { askText } from "../../lib/prompt";
import { openSheet, type MaybeEntry } from "../../lib/sheet";
import { library } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";
import { toast } from "../../lib/toast";
import { BoardNodeView } from "./BoardNode";

const clampZoom = (z: number) => {
  "worklet";
  return Math.min(2.5, Math.max(0.2, z));
};

const PAD = 400;


export type BoardHandle = { fit(): void };

/**
 * Quadro infinito: arrastar o fundo move a câmera, pinça dá zoom,
 * arrastar um nó o move, e "Ligar" + tocar outro nó cria a ligação.
 */
export function Board({ project, onReady }: { project: Project; onReady?: (h: BoardHandle) => void }) {
  const { width, height } = useWindowDimensions();
  const tx = useSharedValue(project.viewport.x);
  const ty = useSharedValue(project.viewport.y);
  const zoom = useSharedValue(project.viewport.zoom);
  const start = useSharedValue({ x: 0, y: 0, z: 1, fx: 0, fy: 0 });
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const [, remeasure] = useReducer((x: number) => x + 1, 0);

  const saveViewport = useCallback((x: number, y: number, z: number) => library.getState().setViewport(project.id, { x, y, zoom: z }), [project.id]);

  const pan = usePanGesture({
    onActivate: () => {
      start.value = { ...start.value, x: tx.value, y: ty.value };
    },
    onUpdate: (e) => {
      tx.value = start.value.x + e.translationX;
      ty.value = start.value.y + e.translationY;
    },
    onDeactivate: () => scheduleOnRN(saveViewport, tx.value, ty.value, zoom.value),
  });

  const pinch = usePinchGesture({
    onActivate: (e) => {
      start.value = { x: tx.value, y: ty.value, z: zoom.value, fx: e.focalX, fy: e.focalY };
    },
    onUpdate: (e) => {
      const z = clampZoom(start.value.z * e.scale);
      const k = z / start.value.z;
      // aproxima em torno do ponto entre os dedos
      tx.value = start.value.fx - (start.value.fx - start.value.x) * k + (e.focalX - start.value.fx);
      ty.value = start.value.fy - (start.value.fy - start.value.y) * k + (e.focalY - start.value.fy);
      zoom.value = z;
    },
    onDeactivate: () => scheduleOnRN(saveViewport, tx.value, ty.value, zoom.value),
  });

  const clear = useCallback(() => {
    setSelected(null);
    setLinkFrom(null);
  }, []);
  const bgTap = useTapGesture({ onDeactivate: (e) => !e.canceled && scheduleOnRN(clear) });
  const canvas = useCompetingGestures(useSimultaneousGestures(pan, pinch), bgTap);

  const world = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }] }));

  /* ── ações dos nós ── */

  const onTap = useCallback(
    (id: string) => {
      tap();
      if (linkFrom && linkFrom !== id) {
        library.getState().connect(project.id, linkFrom, id);
        success();
        setLinkFrom(null);
        setSelected(id);
        return;
      }
      setSelected((s) => (s === id ? null : id));
    },
    [linkFrom, project.id],
  );

  const openNode = useCallback(
    (id: string) => {
      const n = library.getState().projects.find((p) => p.id === project.id)?.nodes.find((x) => x.id === id);
      if (!n) return;
      if (n.kind === "capture") router.push(`/capture/${n.refId}`);
      else if (n.kind === "creation") router.push(`/creation/${n.refId}`);
      else void editText(id, n.text);
    },
    [project.id],
  );

  const editText = async (id: string, current?: string) => {
    const text = await askText("Nota", { initial: current, placeholder: "Escreva uma ideia…", multiline: true });
    if (text) library.getState().updateNode(project.id, id, { text });
    else if (!current) library.getState().removeNode(project.id, id);
  };

  const nodeMenu = useCallback(
    (id: string): MaybeEntry[] => {
      const p = library.getState().projects.find((x) => x.id === project.id);
      const n = p?.nodes.find((x) => x.id === id);
      if (!p || !n) return [];
      const edges = p.edges.filter((e) => e.from === id || e.to === id);
      const nameOf = (nid: string) => {
        const o = p.nodes.find((x) => x.id === nid);
        const s = library.getState();
        return (o?.kind === "capture" ? s.captures.find((c) => c.id === o.refId)?.title : o?.kind === "creation" ? s.creations.find((c) => c.id === o.refId)?.title : o?.text) ?? "nota";
      };
      const C = colors.paperDim;
      return [
        { label: n.kind === "text" ? "Editar texto" : "Abrir", icon: n.kind === "text" ? <Pencil size={18} color={C} /> : <BookOpen size={18} color={C} />, onSelect: () => openNode(id) },
        { label: "Ligar a outro objeto", icon: <Link2 size={18} color={C} />, onSelect: () => startLink(id) },
        edges.length > 0 && {
          label: "Desligar",
          icon: <Unlink size={18} color={C} />,
          children: edges.map((e) => ({ label: nameOf(e.from === id ? e.to : e.from), onSelect: () => library.getState().disconnect(project.id, e.id) })),
        },
        { label: "Tirar do quadro", icon: <Trash2 size={18} color={colors.ember} />, danger: true, onSelect: () => removeNode(id) },
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [project.id, openNode],
  );

  const startLink = (id: string) => {
    setLinkFrom(id);
    setSelected(id);
    toast("Toque no objeto para ligar ✦", undefined, 2500);
  };

  const removeNode = (id: string) => {
    const before = library.getState().projects.find((x) => x.id === project.id)!;
    library.getState().removeNode(project.id, id);
    setSelected(null);
    toast("Tirado do quadro", { label: "Desfazer", run: () => library.setState((s) => ({ projects: s.projects.map((p) => (p.id === project.id ? before : p)) })) });
  };

  const onLongPress = useCallback((id: string) => openSheet(nodeMenu(id)), [nodeMenu]);
  const onDrag = useCallback((id: string, dx: number, dy: number) => setDrag({ id, dx, dy }), []);
  const onDrop = useCallback(
    (id: string, dx: number, dy: number) => {
      setDrag(null);
      const n = library.getState().projects.find((p) => p.id === project.id)?.nodes.find((x) => x.id === id);
      if (n && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) library.getState().updateNode(project.id, id, { x: n.x + dx, y: n.y + dy });
    },
    [project.id],
  );
  const onMeasure = useCallback((id: string, w: number, h: number) => {
    const prev = sizes.current.get(id);
    if (prev && Math.abs(prev.w - w) < 1 && Math.abs(prev.h - h) < 1) return;
    sizes.current.set(id, { w, h });
    remeasure();
  }, []);

  /* ── câmera ── */

  const fit = useCallback(() => {
    const nodes = library.getState().projects.find((p) => p.id === project.id)?.nodes ?? [];
    if (!nodes.length) {
      tx.value = withTiming(0);
      ty.value = withTiming(0);
      zoom.value = withTiming(1);
      return saveViewport(0, 0, 1);
    }
    const box = nodes.map((n) => ({ x: n.x, y: n.y, w: sizes.current.get(n.id)?.w ?? n.w, h: sizes.current.get(n.id)?.h ?? 240 }));
    const minX = Math.min(...box.map((b) => b.x));
    const minY = Math.min(...box.map((b) => b.y));
    const maxX = Math.max(...box.map((b) => b.x + b.w));
    const maxY = Math.max(...box.map((b) => b.y + b.h));
    const z = Math.min(1.2, Math.max(0.2, Math.min((width - 40) / (maxX - minX), (height - 260) / (maxY - minY))));
    const x = width / 2 - ((minX + maxX) / 2) * z;
    const y = (height - 60) / 2 - ((minY + maxY) / 2) * z;
    tx.value = withTiming(x, { duration: 500 });
    ty.value = withTiming(y, { duration: 500 });
    zoom.value = withTiming(z, { duration: 500 });
    saveViewport(x, y, z);
  }, [project.id, width, height, tx, ty, zoom, saveViewport]);

  const handle = useRef<BoardHandle>({ fit });
  handle.current.fit = fit;
  useMemo(() => onReady?.({ fit: () => handle.current.fit() }), [onReady]);

  /* ── ligações ── */

  const pos = (id: string) => {
    const n = project.nodes.find((x) => x.id === id);
    if (!n) return;
    const s = sizes.current.get(id) ?? { w: n.w, h: 240 };
    const d = drag?.id === id ? drag : { dx: 0, dy: 0 };
    return { x: n.x + d.dx + s.w / 2, y: n.y + d.dy + s.h / 2 };
  };
  const bounds = useMemo(() => {
    const xs = project.nodes.flatMap((n) => [n.x, n.x + n.w]);
    const ys = project.nodes.flatMap((n) => [n.y, n.y + (sizes.current.get(n.id)?.h ?? 300)]);
    return { x: Math.min(0, ...xs) - PAD, y: Math.min(0, ...ys) - PAD, w: Math.max(1, ...xs) - Math.min(0, ...xs) + PAD * 2, h: Math.max(1, ...ys) - Math.min(0, ...ys) + PAD * 2 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.nodes, drag]);

  const sel = project.nodes.find((n) => n.id === selected);

  return (
    <View style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={canvas}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <Animated.View style={[styles.world, world]}>
            <Svg style={{ position: "absolute", left: bounds.x + WORLD, top: bounds.y + WORLD }} width={bounds.w} height={bounds.h} pointerEvents="none">
              {project.edges.map((e) => {
                const a = pos(e.from);
                const b = pos(e.to);
                if (!a || !b) return null;
                const lit = selected && (e.from === selected || e.to === selected);
                return (
                  <Line
                    key={e.id}
                    x1={a.x - bounds.x}
                    y1={a.y - bounds.y}
                    x2={b.x - bounds.x}
                    y2={b.y - bounds.y}
                    stroke={lit ? colors.amber : "rgba(255,180,61,0.45)"}
                    strokeWidth={lit ? 2.4 : 1.5}
                    strokeDasharray={lit ? undefined : "6 6"}
                  />
                );
              })}
            </Svg>
            {project.nodes.map((n) => (
              <BoardNodeView
                key={n.id}
                node={n}
                zoom={zoom}
                canvas={pan}
                selected={selected === n.id}
                linking={!!linkFrom && linkFrom !== n.id}
                onTap={onTap}
                onLongPress={onLongPress}
                onDrag={onDrag}
                onDrop={onDrop}
                onMeasure={onMeasure}
              />
            ))}
          </Animated.View>
        </View>
      </GestureDetector>

      {sel && (
        <Animated.View entering={FadeInDown.duration(BASE).easing(EASE)} exiting={FadeOutDown.duration(150)} style={styles.toolbar}>
          {linkFrom ? (
            <>
              <Text style={styles.toolHint}>Toque em outro objeto para ligar</Text>
              <Tool icon={<X size={16} color={colors.paper} />} label="Cancelar" onPress={() => setLinkFrom(null)} />
            </>
          ) : (
            <>
              <Tool icon={sel.kind === "text" ? <Pencil size={16} color={colors.paper} /> : <BookOpen size={16} color={colors.paper} />} label={sel.kind === "text" ? "Editar" : "Abrir"} onPress={() => openNode(sel.id)} />
              <Tool icon={<Link2 size={16} color={colors.paper} />} label="Ligar" onPress={() => startLink(sel.id)} />
              <Tool icon={<Trash2 size={16} color={colors.ember} />} label="Tirar" onPress={() => (press(), removeNode(sel.id))} />
            </>
          )}
        </Animated.View>
      )}
    </View>
  );
}

function Tool({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress(): void }) {
  return (
    <Touch onPress={onPress} style={styles.tool} hitSlop={6}>
      {icon}
      <Text style={styles.toolLabel}>{label}</Text>
    </Touch>
  );
}

const styles = StyleSheet.create({
  world: { position: "absolute", left: -WORLD, top: -WORLD, width: WORLD * 2, height: WORLD * 2, transformOrigin: `${WORLD}px ${WORLD}px` },
  toolbar: {
    position: "absolute",
    alignSelf: "center",
    bottom: 110,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(15,13,28,0.96)",
  },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999 },
  toolLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.paper },
  toolHint: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.cyan, paddingHorizontal: 12 },
});

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { GestureDetector, useCompetingGestures, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from "react-native-gesture-handler";
import Animated, { cancelAnimation, FadeIn, FadeInDown, FadeOutDown, useAnimatedStyle, useSharedValue, withDecay } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { BookOpen, Link2, Pencil, Trash2, Unlink, X } from "lucide-react-native";
import type { Project } from "@myndshelf/types";
import { Touch } from "../../components/Touch";
import { WORLD } from "../../lib/board";
import { press, success, tap } from "../../lib/haptics";
import { BASE, EASE, SLOW, smooth } from "../../lib/motion";
import { askText } from "../../lib/prompt";
import { openSheet, type MaybeEntry } from "../../lib/sheet";
import { library } from "../../lib/store";
import { colors, fonts } from "../../lib/theme";
import { toast } from "../../lib/toast";
import { BoardNodeView } from "./BoardNode";
import { BoardSky, curveMid, type Edge } from "./BoardSky";

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

export type BoardHandle = { fit(): void; zoomBy(f: number): void };

/**
 * Quadro infinito: arrastar o fundo move a câmera (com inércia), pinça dá zoom em torno dos dedos,
 * toque duplo aproxima, arrastar um objeto o move e "Ligar" + tocar outro objeto cria a ligação.
 */
export function Board({ project, onReady }: { project: Project; onReady?: (h: BoardHandle) => void }) {
  const { width, height } = useWindowDimensions();
  const tx = useSharedValue(project.viewport.x);
  const ty = useSharedValue(project.viewport.y);
  const zoom = useSharedValue(project.viewport.zoom);
  const [selected, setSelected] = useState<string | null>(null);
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const sizes = useRef(new Map<string, { w: number; h: number }>());
  const [measured, remeasure] = useReducer((x: number) => x + 1, 0);

  const save = useCallback((x: number, y: number, z: number) => library.getState().setViewport(project.id, { x, y, zoom: z }), [project.id]);

  /* ── câmera ── */

  const pan = usePanGesture({
    onActivate: () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
    },
    onUpdate: (e) => {
      // incremental: convive com a pinça sem um sobrescrever o outro
      tx.value += e.changeX;
      ty.value += e.changeY;
    },
    onDeactivate: (e) => {
      ty.value = withDecay({ velocity: e.velocityY, deceleration: 0.994 });
      tx.value = withDecay({ velocity: e.velocityX, deceleration: 0.994 }, (done) => {
        if (done) scheduleOnRN(save, tx.value, ty.value, zoom.value);
      });
    },
  });

  const pinch = usePinchGesture({
    onActivate: () => {
      cancelAnimation(tx);
      cancelAnimation(ty);
    },
    onUpdate: (e) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * e.scaleChange));
      const k = z / zoom.value;
      tx.value = e.focalX - (e.focalX - tx.value) * k;
      ty.value = e.focalY - (e.focalY - ty.value) * k;
      zoom.value = z;
    },
    onDeactivate: () => scheduleOnRN(save, tx.value, ty.value, zoom.value),
  });

  const zoomAt = (f: number, fx: number, fy: number) => {
    "worklet";
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * f));
    const k = z / zoom.value;
    tx.value = smooth(fx - (fx - tx.value) * k);
    ty.value = smooth(fy - (fy - ty.value) * k);
    zoom.value = smooth(z);
  };

  const clear = useCallback(() => {
    setSelected(null);
    setLinkFrom(null);
  }, []);
  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (e) => {
      if (e.canceled) return;
      zoomAt(zoom.value > 1.4 ? 0.6 : 1.6, e.x, e.y);
      scheduleOnRN(save, tx.value, ty.value, zoom.value);
    },
  });
  const singleTap = useTapGesture({ onDeactivate: (e) => !e.canceled && scheduleOnRN(clear) });
  const canvas = useCompetingGestures(useSimultaneousGestures(pan, pinch), useExclusiveGestures(doubleTap, singleTap));

  const world = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: zoom.value }] }));

  /* ── enquadrar ── */

  const fit = useCallback(
    (animated = true) => {
      const nodes = library.getState().projects.find((p) => p.id === project.id)?.nodes ?? [];
      let x = width / 2;
      let y = height / 2;
      let z = 1;
      if (nodes.length) {
        const box = nodes.map((n) => ({ x: n.x, y: n.y, w: sizes.current.get(n.id)?.w ?? n.w, h: sizes.current.get(n.id)?.h ?? 240 }));
        const minX = Math.min(...box.map((b) => b.x));
        const minY = Math.min(...box.map((b) => b.y));
        const maxX = Math.max(...box.map((b) => b.x + b.w));
        const maxY = Math.max(...box.map((b) => b.y + b.h));
        // espaço útil: abaixo do cabeçalho, acima dos botões
        const top = 110;
        const bottom = 120;
        z = Math.min(1.1, Math.max(MIN_ZOOM, Math.min((width - 48) / (maxX - minX), (height - top - bottom) / (maxY - minY))));
        x = width / 2 - ((minX + maxX) / 2) * z;
        y = top + (height - top - bottom) / 2 - ((minY + maxY) / 2) * z;
      }
      if (animated) {
        tx.value = smooth(x, SLOW);
        ty.value = smooth(y, SLOW);
        zoom.value = smooth(z, SLOW);
      } else {
        tx.value = x;
        ty.value = y;
        zoom.value = z;
      }
      save(x, y, z);
    },
    [project.id, width, height, tx, ty, zoom, save],
  );

  useEffect(() => {
    onReady?.({ fit: () => fit(), zoomBy: (f) => zoomAt(f, width / 2, height / 2) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onReady, fit, width, height]);

  // a câmera salva pode ter vindo do desktop (outra tela): se nada aparece, enquadra tudo
  const checked = useRef(false);
  useEffect(() => {
    if (checked.current || !project.nodes.length || sizes.current.size < project.nodes.length) return;
    checked.current = true;
    const v = { x: tx.value, y: ty.value, z: zoom.value };
    const visible = project.nodes.some((n) => {
      const s = sizes.current.get(n.id)!;
      const l = n.x * v.z + v.x;
      const t = n.y * v.z + v.y;
      return l + s.w * v.z > 0 && l < width && t + s.h * v.z > 0 && t < height;
    });
    if (!visible) fit(false);
  }, [measured, project.nodes, fit, width, height, tx, ty, zoom]);

  /* ── nós ── */

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

  const editText = async (id: string, current?: string) => {
    const text = await askText("Nota", { initial: current, placeholder: "Escreva uma ideia…", multiline: true });
    if (text) library.getState().updateNode(project.id, id, { text });
    else if (!current) library.getState().removeNode(project.id, id);
  };

  const openNode = (id: string) => {
    const n = library.getState().projects.find((p) => p.id === project.id)?.nodes.find((x) => x.id === id);
    if (!n) return;
    if (n.kind === "capture") router.push(`/capture/${n.refId}`);
    else if (n.kind === "creation") router.push(`/creation/${n.refId}`);
    else void editText(id, n.text);
  };

  const onTap = (id: string) => {
    tap();
    if (linkFrom && linkFrom !== id) {
      library.getState().connect(project.id, linkFrom, id);
      success();
      setLinkFrom(null);
      setSelected(id);
      return;
    }
    setSelected((s) => (s === id ? null : id));
  };

  const nodeMenu = (id: string): MaybeEntry[] => {
    const p = library.getState().projects.find((x) => x.id === project.id);
    const n = p?.nodes.find((x) => x.id === id);
    if (!p || !n) return [];
    const edges = p.edges.filter((e) => e.from === id || e.to === id);
    const C = colors.paperDim;
    return [
      { label: n.kind === "text" ? "Editar texto" : "Abrir", icon: n.kind === "text" ? <Pencil size={18} color={C} /> : <BookOpen size={18} color={C} />, onSelect: () => openNode(id) },
      { label: "Ligar a outro objeto", icon: <Link2 size={18} color={C} />, onSelect: () => startLink(id) },
      edges.length > 0 && { label: "Desligar tudo", hint: String(edges.length), icon: <Unlink size={18} color={C} />, onSelect: () => edges.forEach((e) => library.getState().disconnect(project.id, e.id)) },
      { label: "Tirar do quadro", icon: <Trash2 size={18} color={colors.ember} />, danger: true, onSelect: () => removeNode(id) },
    ];
  };

  // os nós recebem callbacks estáveis; a lógica de cima sempre lê o estado atual
  const handlers = useRef({ onTap, nodeMenu });
  handlers.current = { onTap, nodeMenu };
  const onNodeTap = useCallback((id: string) => handlers.current.onTap(id), []);
  const onLongPress = useCallback((id: string) => openSheet(handlers.current.nodeMenu(id)), []);
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

  /* ── ligações ── */

  const edges = useMemo(() => {
    const center = (id: string) => {
      const n = project.nodes.find((x) => x.id === id);
      if (!n) return;
      const s = sizes.current.get(id) ?? { w: n.w, h: 220 };
      const d = drag?.id === id ? drag : { dx: 0, dy: 0 };
      return { x: n.x + d.dx + s.w / 2, y: n.y + d.dy + s.h / 2 };
    };
    return project.edges.flatMap((e): Edge[] => {
      const a = center(e.from);
      const b = center(e.to);
      return a && b ? [{ id: e.id, a, b, lit: !!selected && (e.from === selected || e.to === selected) }] : [];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.nodes, project.edges, drag, selected, measured]);

  const sel = project.nodes.find((n) => n.id === selected);

  return (
    <Animated.View entering={FadeIn.duration(SLOW).easing(EASE)} style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={canvas}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          <BoardSky tx={tx} ty={ty} zoom={zoom} edges={edges} />
          <Animated.View style={[styles.world, world]}>
            {project.nodes.map((n) => (
              <BoardNodeView
                key={n.id}
                node={n}
                zoom={zoom}
                canvas={pan}
                selected={selected === n.id}
                linking={!!linkFrom && linkFrom !== n.id}
                onTap={onNodeTap}
                onLongPress={onLongPress}
                onDrag={onDrag}
                onDrop={onDrop}
                onMeasure={onMeasure}
              />
            ))}
            {/* desligar: um × no meio de cada ligação do objeto selecionado */}
            {!linkFrom &&
              edges
                .filter((e) => e.lit)
                .map((e) => {
                  const m = curveMid(e.a, e.b);
                  return (
                    <Touch key={e.id} hitSlop={10} style={[styles.unlink, { left: m.x + WORLD - 12, top: m.y + WORLD - 12 }]} onPress={() => (press(), library.getState().disconnect(project.id, e.id))}>
                      <X size={13} color={colors.void} />
                    </Touch>
                  );
                })}
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
    </Animated.View>
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
  unlink: { position: "absolute", width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.ember, shadowColor: colors.ember, shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  toolbar: {
    position: "absolute",
    alignSelf: "center",
    bottom: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: "rgba(12,10,21,0.92)",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  tool: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999 },
  toolLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.paper },
  toolHint: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.cyan, paddingHorizontal: 12 },
});

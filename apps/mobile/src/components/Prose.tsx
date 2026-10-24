import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { openInApp } from "../lib/platform";
import { colors, fonts, hsl } from "../lib/theme";

export interface ProseRef {
  label: string;
  hue?: number;
  open(): void;
}

/** A rede entrega o texto aos trancos; aqui ele escorre a um ritmo contínuo. */
function useFlowingText(target: string, live: boolean) {
  const [shown, setShown] = useState(live ? "" : target);
  const pos = useRef(shown.length);
  useEffect(() => {
    if (!live) {
      pos.current = target.length;
      setShown(target);
      return;
    }
    let raf = 0;
    const tick = () => {
      const backlog = target.length - pos.current;
      if (backlog <= 0) return;
      pos.current += Math.max(1, Math.ceil(backlog / 12));
      setShown(target.slice(0, pos.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, live]);
  return shown;
}

/** Markdown de bolso: **negrito**, *itálico*, [links](…) e as referências [[c3]] do acervo. */
function inline(text: string, resolve?: (key: string) => ProseRef | undefined): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|\[\[([\w-]+)\]\]|\[([^\]]+)\]\((https?:[^)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<Text key={k++} style={styles.bold}>{m[1]}</Text>);
    else if (m[2]) out.push(<Text key={k++} style={styles.italic}>{m[2]}</Text>);
    else if (m[3]) {
      const ref = resolve?.(m[3]);
      if (ref)
        out.push(
          <Text key={k++} onPress={ref.open} style={[styles.ref, { color: hsl(ref.hue ?? 38, 85, 72), textDecorationColor: hsl(ref.hue ?? 38, 85, 60, 0.6) }]}>
            {ref.label}
          </Text>,
        );
    } else if (m[4]) {
      const url = m[5];
      out.push(
        <Text key={k++} style={styles.link} onPress={() => void openInApp(url)}>
          {m[4]}
        </Text>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Texto gerado: os parágrafos que já estavam na tela ficam parados e só os novos entram. */
export function Prose({ text, streaming, resolve, size = 16 }: { text: string; streaming?: boolean; resolve?: (key: string) => ProseRef | undefined; size?: number }) {
  const live = useRef(!!streaming).current;
  const shown = useFlowingText(text, live);
  const writing = live && (streaming || shown.length < text.length);

  const blocks = useMemo(() => {
    // referência pela metade ("[[c1") espera o resto chegar; negrito aberto já fecha
    let ready = writing ? shown.replace(/\[\[[^\]]*\]?$/, "").replace(/\*$/, "") : shown;
    if (writing && (ready.match(/\*\*/g)?.length ?? 0) % 2) ready += "**";
    return ready.split(/\n{2,}/).filter((b) => b.trim());
  }, [shown, writing]);

  const body = { fontSize: size, lineHeight: size * 1.5 };
  return (
    <View style={styles.prose}>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const list = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        return (
          <Animated.View key={i} entering={FadeIn.duration(320)}>
            {list ? (
              lines.map((l, j) => {
                const [, bullet, rest] = /^\s*([-*•]|\d+[.)])\s+(.*)$/.exec(l)!;
                return (
                  <View key={j} style={styles.li}>
                    <Text style={[styles.bullet, body]}>{/\d/.test(bullet) ? bullet : "✦"}</Text>
                    <Text style={[styles.text, body, { flex: 1 }]}>{inline(rest, resolve)}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.text, body]}>{inline(block.replace(/^#+\s*/gm, ""), resolve)}</Text>
            )}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  prose: { gap: 12 },
  text: { fontFamily: fonts.prose, color: colors.paper },
  bold: { fontFamily: fonts.proseSemi },
  italic: { fontFamily: fonts.proseItalic },
  link: { color: colors.cyan, textDecorationLine: "underline" },
  ref: { fontFamily: fonts.displayItalic, textDecorationLine: "underline" },
  li: { flexDirection: "row", gap: 10, marginBottom: 4 },
  bullet: { fontFamily: fonts.prose, color: colors.amber, fontSize: 11, width: 16 },
});

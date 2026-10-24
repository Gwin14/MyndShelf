import { useMemo } from "react";
import { ScrollView, StyleSheet } from "react-native";
import { KIND_LABELS } from "@myndshelf/core";
import type { CaptureKind } from "@myndshelf/types";
import { Chip } from "../../components/Chip";
import { useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";
import { GUTTER } from "../../lib/layout";

/** Tipos e etiquetas — a barra lateral do desktop virou duas fileiras roláveis. */
export function Filters() {
  const captures = useLibrary((s) => s.captures);
  const kind = useUi((s) => s.captureKind);
  const tag = useUi((s) => s.captureTag);
  const set = useUi((s) => s.set);

  const { kinds, tags } = useMemo(() => {
    const kinds = new Map<CaptureKind, number>();
    const tags = new Map<string, number>();
    for (const c of captures) {
      kinds.set(c.kind, (kinds.get(c.kind) ?? 0) + 1);
      for (const t of c.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    return {
      kinds: [...kinds.entries()].sort((a, b) => b[1] - a[1]),
      tags: [...tags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40),
    };
  }, [captures]);

  if (captures.length < 2) return null;
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.content}>
        <Chip label="Tudo" count={captures.length} active={kind === "all"} onPress={() => set({ captureKind: "all" })} />
        {kinds.map(([k, n]) => (
          <Chip key={k} label={KIND_LABELS[k]} count={n} active={kind === k} onPress={() => set({ captureKind: kind === k ? "all" : k })} />
        ))}
      </ScrollView>
      {tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row} contentContainerStyle={styles.content}>
          {tags.map(([t, n]) => (
            <Chip key={t} label={`#${t}`} count={n} active={tag === t} onPress={() => set({ captureTag: tag === t ? null : t })} />
          ))}
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { marginHorizontal: -GUTTER, marginBottom: 10, flexGrow: 0 },
  content: { gap: 8, paddingHorizontal: GUTTER },
});

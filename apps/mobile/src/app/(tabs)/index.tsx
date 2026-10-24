import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { coverHeight, KIND_LABELS } from "@myndshelf/core";
import { Empty } from "../../components/Empty";
import { Headline } from "../../components/Headline";
import { Masonry } from "../../components/Masonry";
import { Segmented } from "../../components/Segmented";
import { TopBar } from "../../components/TopBar";
import { AddBar } from "../../features/capture/AddBar";
import { CaptureCard } from "../../features/capture/CaptureCard";
import { ClipboardOffer } from "../../features/capture/ClipboardOffer";
import { FeedView } from "../../features/capture/FeedView";
import { Filters } from "../../features/capture/Filters";
import { refreshCapture } from "../../lib/capture";
import { refreshAll } from "../../lib/feeds";
import { GUTTER, useColumns } from "../../lib/layout";
import { library, useLibrary } from "../../lib/store";
import { useUi } from "../../lib/ui";

const PAGE = 40;

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const captures = useLibrary((s) => s.captures);
  const unread = useLibrary((s) => s.feedEntries.reduce((n, e) => n + (e.read ? 0 : 1), 0));
  const { captureKind, captureTag, captureQuery, captureMode, set } = useUi();
  const { columns, colWidth, gap } = useColumns(150, 14);
  const [limit, setLimit] = useState(PAGE);
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo(() => {
    const q = captureQuery.trim().toLowerCase();
    return captures.filter(
      (c) =>
        (captureKind === "all" || c.kind === captureKind) &&
        (!captureTag || c.tags.includes(captureTag)) &&
        (!q || [c.title, c.description, c.note, c.siteName, c.author, ...c.tags].some((t) => t?.toLowerCase().includes(q))),
    );
  }, [captures, captureKind, captureTag, captureQuery]);
  const visible = useMemo(() => items.slice(0, limit), [items, limit]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // puxar para atualizar: sintoniza as transmissões e tenta de novo o que ficou sem sinal
    const errored = library.getState().captures.filter((c) => c.status === "error").slice(0, 10);
    await Promise.all([refreshAll(true), ...errored.map((c) => refreshCapture(c.id))]);
    setRefreshing(false);
  }, []);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      if (contentOffset.y + layoutMeasurement.height > contentSize.height - 1200 && limit < items.length) setLimit((l) => l + PAGE);
    },
    [limit, items.length],
  );

  const filterLabel = captureKind === "all" ? "referências" : KIND_LABELS[captureKind].toLowerCase();

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.pad, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 120 }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScroll={onScroll}
      scrollEventThrottle={200}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ffb43d" />}
    >
      <TopBar />
      <Headline kicker={`I — Captura · ${captureMode === "wall" ? `${items.length} ${filterLabel}` : "transmissões"}`} before="Tudo o que" em="te" after="atravessa." />
      <View style={styles.mode}>
        <Segmented
          value={captureMode}
          onChange={(captureMode) => set({ captureMode })}
          options={[
            { id: "wall", label: "Mural" },
            { id: "feeds", label: "Transmissões", badge: unread },
          ]}
        />
      </View>

      {captureMode === "feeds" ? (
        <FeedView />
      ) : (
        <>
          <ClipboardOffer />
          <AddBar />
          <Filters />
          {visible.length ? (
            <View style={styles.wall}>
              <Masonry
                items={visible}
                columns={columns}
                gap={gap}
                estimate={coverHeight}
                getKey={(item) => item.id}
                render={(item, i) => <CaptureCard item={item} index={i} width={colWidth} />}
              />
            </View>
          ) : captureQuery.trim() ? (
            <Empty title={`Nada no céu com “${captureQuery.trim().slice(0, 40)}”.`} hint="Toque em Guardar para virar nota, ou pergunte ao acervo." />
          ) : (
            <Empty title="O céu ainda está quieto." hint="Cole um link, fotografe algo ou escreva acima." />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { paddingHorizontal: GUTTER, maxWidth: 1400, width: "100%", alignSelf: "center" },
  mode: { marginBottom: 16 },
  wall: { marginTop: 6 },
});

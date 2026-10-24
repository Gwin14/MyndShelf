import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Bookmark, BookmarkCheck, CheckCheck, Plus, Radio } from "lucide-react-native";
import { relativeDate, viewModeOf } from "@myndshelf/core";
import type { Feed, FeedEntry } from "@myndshelf/types";
import { Button } from "../../components/Button";
import { Chip } from "../../components/Chip";
import { Empty } from "../../components/Empty";
import { Touch } from "../../components/Touch";
import { saveEntry } from "../../lib/capture";
import { entryAsItem } from "../../lib/feeds";
import { success } from "../../lib/haptics";
import { GUTTER } from "../../lib/layout";
import { feedEntryMenu, feedMenu } from "../../lib/menus";
import { openInApp } from "../../lib/platform";
import { openSheet } from "../../lib/sheet";
import { library, useLibrary } from "../../lib/store";
import { colors, fonts, hsl } from "../../lib/theme";
import { useUi } from "../../lib/ui";

/** Cada feed ganha uma "frequência" estável, como uma estação de rádio. */
export const frequencyOf = (hue: number) => (88 + (hue / 360) * 20).toFixed(1);

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const diff = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Ontem";
  const s = d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function openEntry(e: FeedEntry) {
  library.getState().updateEntry(e.id, { read: true });
  const feed = library.getState().feeds.find((f) => f.id === e.feedId);
  if (viewModeOf(entryAsItem(e, feed))) router.push({ pathname: "/view/[id]", params: { id: e.id, entry: "1" } });
  else if (e.url) void openInApp(e.url);
}

/** Transmissões: as novidades dos feeds seguidos, por dia — como um rádio de ondas curtas. */
export function FeedView() {
  const feeds = useLibrary((s) => s.feeds);
  const allEntries = useLibrary((s) => s.feedEntries);
  const feedId = useUi((s) => s.captureFeed);
  const set = useUi((s) => s.set);
  const [onlyUnread, setOnlyUnread] = useState(false);

  const feed = feeds.find((f) => f.id === feedId);
  const feedsById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);
  const unreadBy = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of allEntries) if (!e.read) m.set(e.feedId, (m.get(e.feedId) ?? 0) + 1);
    return m;
  }, [allEntries]);

  const groups = useMemo(() => {
    const entries = allEntries
      .filter((e) => (!feed || e.feedId === feed.id) && (!onlyUnread || !e.read))
      .sort((a, b) => b.publishedAt - a.publishedAt)
      .slice(0, 300);
    const out: { label: string; items: FeedEntry[] }[] = [];
    for (const e of entries) {
      const label = dayLabel(e.publishedAt);
      if (out.at(-1)?.label !== label) out.push({ label, items: [] });
      out.at(-1)!.items.push(e);
    }
    return out;
  }, [allEntries, feed, onlyUnread]);

  const unread = feed ? (unreadBy.get(feed.id) ?? 0) : [...unreadBy.values()].reduce((a, b) => a + b, 0);

  if (!feeds.length) {
    return (
      <View>
        <Empty title="Estática." hint="Siga blogs, revistas, canais do YouTube, podcasts — cole qualquer link e o feed é encontrado sozinho." />
        <Button variant="flare" label="Sintonizar uma transmissão" icon={<Plus size={16} color={colors.void} />} style={{ alignSelf: "center" }} onPress={() => router.push("/feeds/add")} />
      </View>
    );
  }

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stations} contentContainerStyle={styles.stationsContent}>
        <Chip label="Todas" active={!feed} count={[...unreadBy.values()].reduce((a, b) => a + b, 0) || undefined} onPress={() => set({ captureFeed: null })} />
        {feeds.map((f) => (
          <Chip
            key={f.id}
            label={f.title}
            icon={<View style={[styles.dot, { backgroundColor: hsl(f.hue, 80, 60) }]} />}
            active={feed?.id === f.id}
            count={unreadBy.get(f.id)}
            onPress={() => set({ captureFeed: feed?.id === f.id ? null : f.id })}
            onLongPress={() => openSheet(feedMenu(f), f.title, `FM ${frequencyOf(f.hue)}`)}
          />
        ))}
        <Chip label="Sintonizar" icon={<Plus size={14} color={colors.amber} />} onPress={() => router.push("/feeds/add")} />
      </ScrollView>

      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.station}>{feed ? `FM ${frequencyOf(feed.hue)}` : "Todas as transmissões"}</Text>
          <Text style={styles.title} numberOfLines={2}>
            {feed ? feed.title : "Sinais de longe."}
          </Text>
          <Text style={styles.count}>
            {unread} {unread === 1 ? "nova" : "novas"}
          </Text>
        </View>
        <Button small label={onlyUnread ? "Só novas" : "Todas"} onPress={() => setOnlyUnread((v) => !v)} />
        <Button small icon={<CheckCheck size={15} color={colors.paper} />} onPress={() => library.getState().markFeedRead(feed?.id ?? null)} />
      </View>
      {feed?.error ? <Text style={styles.error}>⚠ sem sinal: {feed.error}</Text> : null}

      {!groups.length && <Empty title={onlyUnread ? "Nada de novo no ar." : "Estática."} hint={onlyUnread ? "Você ouviu tudo o que chegou." : "Nenhuma transmissão por aqui ainda."} />}

      {groups.map((g) => (
        <View key={g.label} style={styles.day}>
          <Text style={styles.dayLabel}>{g.label}</Text>
          {g.items.map((e, i) => (
            <Transmission key={e.id} entry={e} feed={feedsById.get(e.feedId)} showSource={!feed} index={i} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Transmission({ entry, feed, showSource, index }: { entry: FeedEntry; feed?: Feed; showSource: boolean; index: number }) {
  const hue = feed?.hue ?? 30;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30)}>
      <Touch scale={0.98} style={styles.tx} onPress={() => openEntry(entry)} onLongPress={() => openSheet(feedEntryMenu(entry, () => openEntry(entry)), entry.title)}>
        <View style={[styles.signal, { backgroundColor: entry.read ? "transparent" : hsl(hue, 90, 65), borderColor: hsl(hue, 70, 55, 0.6) }]} />
        <View style={styles.txBody}>
          {showSource && feed ? (
            <View style={styles.source}>
              <Radio size={10} color={hsl(hue, 80, 65)} />
              <Text style={[styles.sourceText, { color: hsl(hue, 70, 72) }]} numberOfLines={1}>
                {feed.title}
              </Text>
            </View>
          ) : null}
          <Text style={[styles.txTitle, entry.read && styles.read]} numberOfLines={3}>
            {entry.title}
          </Text>
          {entry.summary ? (
            <Text style={styles.summary} numberOfLines={2}>
              {entry.summary}
            </Text>
          ) : null}
          <Text style={styles.when}>
            {entry.author ? `${entry.author} · ` : ""}
            {relativeDate(entry.publishedAt)}
          </Text>
        </View>
        {entry.image ? <Image source={{ uri: entry.image }} style={styles.thumb} contentFit="cover" transition={200} /> : null}
        <Touch
          hitSlop={10}
          style={styles.save}
          accessibilityLabel={entry.savedAs ? "Guardado" : "Guardar na Captura"}
          onPress={async () => {
            if (entry.savedAs) return router.push(`/capture/${entry.savedAs}`);
            success();
            await saveEntry(entry);
          }}
        >
          {entry.savedAs ? <BookmarkCheck size={18} color={colors.amber} /> : <Bookmark size={18} color={colors.paperMute} />}
        </Touch>
      </Touch>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stations: { marginHorizontal: -GUTTER, marginBottom: 18, flexGrow: 0 },
  stationsContent: { gap: 8, paddingHorizontal: GUTTER },
  dot: { width: 7, height: 7, borderRadius: 4 },
  head: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginBottom: 10 },
  station: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1.6, textTransform: "uppercase", color: colors.paperMute },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 32, color: colors.paper },
  count: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: colors.amber, marginTop: 2 },
  error: { fontFamily: fonts.mono, fontSize: 10, color: colors.ember, marginBottom: 8 },
  day: { marginTop: 18 },
  dayLabel: { fontFamily: fonts.displayItalic, fontSize: 22, color: colors.paperDim, marginBottom: 6, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.line },
  tx: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  signal: { width: 8, height: 8, borderRadius: 4, borderWidth: 1, marginTop: 7 },
  txBody: { flex: 1, minWidth: 0 },
  source: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 3 },
  sourceText: { fontFamily: fonts.mono, fontSize: 9.5, letterSpacing: 0.8, textTransform: "uppercase", flexShrink: 1 },
  txTitle: { fontFamily: fonts.display, fontSize: 19, lineHeight: 21, color: colors.paper },
  read: { color: colors.paperMute },
  summary: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.paperDim, marginTop: 4 },
  when: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8, textTransform: "uppercase", color: colors.paperMute, marginTop: 6 },
  thumb: { width: 64, height: 64, borderRadius: 8, backgroundColor: colors.nebula },
  save: { paddingTop: 4 },
});

import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { balanceColumns } from "@myndshelf/core";

/** Colunas equilibradas pela altura estimada de cada capa, sem medir nada. */
export function Masonry<T>({
  items,
  columns,
  gap,
  estimate,
  getKey,
  render,
}: {
  items: T[];
  columns: number;
  gap: number;
  estimate: (item: T) => number;
  getKey: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
}) {
  const cols = useMemo(() => {
    const order = new Map(items.map((item, i) => [item, i]));
    return balanceColumns(items, columns, estimate).map((col) => col.map((item) => ({ item, index: order.get(item)! })));
  }, [items, columns, estimate]);
  return (
    <View style={[styles.row, { gap }]}>
      {cols.map((col, c) => (
        <View key={c} style={[styles.col, { gap: gap * 1.6 }]}>
          {col.map(({ item, index }) => (
            <View key={getKey(item)}>{render(item, index)}</View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  col: { flex: 1, minWidth: 0 },
});

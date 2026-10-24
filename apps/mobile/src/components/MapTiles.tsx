import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { worldPixel } from "@myndshelf/core";

/** Tiles de 256px exibidos a 128pt (um nível acima) = nítido em telas retina. */
const TILE = 128;

/** Mapa estático feito de tiles (Esri World Topo — sem chave de API), centrado na coordenada. */
export function MapTiles({ lat, lng, zoom = 15, width, height }: { lat: number; lng: number; zoom?: number; width: number; height: number }) {
  const z = Math.max(3, Math.min(18, Math.round(zoom))) + 1;
  const world = worldPixel(lat, lng, z);
  const p = { x: world.x / 2, y: world.y / 2 };
  const cx = Math.floor(p.x / TILE);
  const cy = Math.floor(p.y / TILE);
  const rx = Math.ceil(width / 2 / TILE) + 1;
  const ry = Math.ceil(height / 2 / TILE) + 1;
  const max = 2 ** z;

  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  if (width) {
    for (let dx = -rx; dx <= rx; dx++) {
      for (let dy = -ry; dy <= ry; dy++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (ty < 0 || ty >= max) continue;
        const wx = ((tx % max) + max) % max;
        const left = tx * TILE - p.x + width / 2;
        const top = ty * TILE - p.y + height / 2;
        if (left > width || top > height || left + TILE < 0 || top + TILE < 0) continue;
        tiles.push({ key: `${tx}:${ty}`, src: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${ty}/${wx}`, left, top });
      }
    }
  }

  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]} pointerEvents="none">
      {tiles.map((t) => (
        <Image key={t.key} source={{ uri: t.src }} cachePolicy="disk" style={{ position: "absolute", left: t.left, top: t.top, width: TILE, height: TILE }} />
      ))}
      {/* atlas antigo: um véu sépia sobre o mapa topográfico */}
      <View style={[StyleSheet.absoluteFill, styles.sepia]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: "hidden", backgroundColor: "#e9dfc6" },
  sepia: { backgroundColor: "rgba(150, 105, 50, 0.16)" },
});

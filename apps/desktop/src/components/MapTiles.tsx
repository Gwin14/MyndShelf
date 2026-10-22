import { useLayoutEffect, useRef, useState } from "react";
import { worldPixel } from "@myndshelf/core";

/** Tamanho na tela: tiles de 256px exibidos a 128px (um nível acima) = nítido em telas retina. */
const TILE = 128;

/**
 * Mapa estático feito de tiles (Esri World Topo — sem chave de API),
 * centrado na coordenada. Leve o bastante para viver dentro de um card.
 */
export function MapTiles({ lat, lng, zoom = 15 }: { lat: number; lng: number; zoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const z = Math.max(3, Math.min(18, Math.round(zoom))) + 1;
  const world = worldPixel(lat, lng, z);
  const p = { x: world.x / 2, y: world.y / 2 };
  const cx = Math.floor(p.x / TILE);
  const cy = Math.floor(p.y / TILE);
  const rx = Math.ceil(size.w / 2 / TILE) + 1;
  const ry = Math.ceil(size.h / 2 / TILE) + 1;
  const max = 2 ** z;

  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  if (size.w) {
    for (let dx = -rx; dx <= rx; dx++) {
      for (let dy = -ry; dy <= ry; dy++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (ty < 0 || ty >= max) continue;
        const wx = ((tx % max) + max) % max;
        tiles.push({
          key: `${tx}:${ty}`,
          src: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/${z}/${ty}/${wx}`,
          left: tx * TILE - p.x + size.w / 2,
          top: ty * TILE - p.y + size.h / 2,
        });
      }
    }
  }

  return (
    <div ref={ref} className="map-tiles" aria-hidden title="Mapa: Esri, OpenStreetMap">
      {tiles.map((t) => (
        <img
          key={t.key}
          src={t.src}
          alt=""
          draggable={false}
          style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
      ))}
    </div>
  );
}

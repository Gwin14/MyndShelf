import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/** Reduz uma imagem local para uma prévia leve em data URL (como `downscaleImage` no desktop). */
export async function downscaleToDataUrl(uri: string, width: number, height: number, max = 1400, compress = 0.86) {
  const scale = Math.min(1, max / Math.max(width || max, height || max));
  const ctx = ImageManipulator.manipulate(uri);
  if (scale < 1) ctx.resize({ width: Math.round(width * scale) });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  return `data:image/jpeg;base64,${out.base64}`;
}

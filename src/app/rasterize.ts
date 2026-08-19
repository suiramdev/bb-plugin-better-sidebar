/**
 * Uploads are normalized in the browser, not on the server: any image the
 * client can decode becomes one 128px PNG, so the server never has to resize
 * (it has no image library) and a 4MB logo never reaches the icon store.
 */
export const ICON_PIXELS = 128;

export async function rasterizeToIconDataUrl(
  file: Blob,
  pixels = ICON_PIXELS,
): Promise<string> {
  const bitmap = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("This browser cannot resize images.");
  // Contain, centered: an icon must not be stretched to a square.
  const scale = Math.min(pixels / bitmap.width, pixels / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.drawImage(
    bitmap,
    (pixels - width) / 2,
    (pixels - height) / 2,
    width,
    height,
  );
  return canvas.toDataURL("image/png");
}

interface DrawableImage {
  width: number;
  height: number;
}

async function loadImage(file: Blob): Promise<CanvasImageSource & DrawableImage> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // Safari refuses some SVGs here; the <img> path below handles them.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("That file is not an image."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

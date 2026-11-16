/**
 * Shrink an image in memory only (never uploaded to storage) for AI reading.
 * Same pattern as the receipt scanner in TransactionForm: downscale so the
 * longest side is at most `maxSide` px, encode as JPEG.
 * Returns a data URL (image/jpeg).
 */
export async function shrinkImageFile(file: File, maxSide = 1600): Promise<string> {
  // Fallback to <img> decoding for formats createImageBitmap rejects (e.g. iPhone HEIC).
  const src: { el: CanvasImageSource; w: number; h: number; done: () => void } =
    await createImageBitmap(file)
      .then((b) => ({
        el: b as CanvasImageSource,
        w: b.width,
        h: b.height,
        done: () => b.close(),
      }))
      .catch(async () => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.src = url;
        await img.decode();
        return {
          el: img as CanvasImageSource,
          w: img.naturalWidth,
          h: img.naturalHeight,
          done: () => URL.revokeObjectURL(url),
        };
      });
  const scale = Math.min(1, maxSide / Math.max(src.w, src.h));
  const cv = document.createElement("canvas");
  cv.width = Math.round(src.w * scale);
  cv.height = Math.round(src.h * scale);
  const ctx = cv.getContext("2d");
  if (!ctx) {
    src.done();
    throw new Error("לא ניתן לקרוא את התמונה");
  }
  ctx.drawImage(src.el, 0, 0, cv.width, cv.height);
  src.done();
  return cv.toDataURL("image/jpeg", 0.8);
}

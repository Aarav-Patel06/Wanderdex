import { THUMBNAIL_SIZE } from "@/lib/trip/config";
import type { ThumbnailDone, ThumbnailJob } from "@/lib/trip/thumbnails";

// The review's thumbnail worker (SPEC §11.8 step 7), started by thumbnails.ts: decoding a photo
// and scaling it down run here, off the page's thread. The files stay in the browser. It imports
// only types from thumbnails.ts, which holds this file's URL: a value import would put the worker
// inside its own bundle.
const scope = self as unknown as {
  postMessage: (message: ThumbnailDone) => void;
  addEventListener: (type: "message", listener: (event: MessageEvent<ThumbnailJob>) => void) => void;
};

scope.addEventListener("message", async ({ data: { id, file } }) => {
  scope.postMessage({ id, thumbnail: await makeThumbnail(file) });
});

// The photo as a THUMBNAIL_SIZE px square JPEG, the middle of it cropped square, turned upright (decoding
// applies the EXIF orientation), or null if it can't be decoded.
async function makeThumbnail(file: Blob): Promise<Blob | null> {
  const size = THUMBNAIL_SIZE;
  try {
    // Scaled while decoding, to twice the size across, so the square's shorter side keeps at least
    // `size` pixels for 4:3 and 16:9 photos alike.
    const bitmap = await createImageBitmap(file, { resizeWidth: size * 2, resizeQuality: "medium" });
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(size, size);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    bitmap.close();
    return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  } catch {
    return null;
  }
}

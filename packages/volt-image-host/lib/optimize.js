// optimize.js — sharp (libvips) image optimization. This lives in the HOST
// infra, never in core Volt: sharp is a native/compiled dependency, and core
// Volt's promise is "runs anywhere with just Node." Here it's fine — the host
// controls its own runtime.
//
// One optimized output per upload (webp by default), EXIF honored then stripped,
// longest edge capped. That single step is what makes a 1 GB quota feel like
// several GB and every hosted site faster.

import sharp from "sharp";

const MAX_DIM = Number(process.env.IMAGE_MAX_DIM || 2400); // nobody needs a 6000px hero on the web

export async function optimize(buffer, { format = "webp", quality = 80 } = {}) {
  const img = sharp(buffer, { failOn: "none" }).rotate(); // apply EXIF orientation, then metadata is dropped by re-encode
  const meta = await img.metadata();

  let pipe = img;
  if (Math.max(meta.width || 0, meta.height || 0) > MAX_DIM) {
    pipe = pipe.resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true });
  }
  pipe = format === "avif" ? pipe.avif({ quality }) : pipe.webp({ quality });

  const { data, info } = await pipe.toBuffer({ resolveWithObject: true });
  return {
    data,
    format,
    contentType: format === "avif" ? "image/avif" : "image/webp",
    width: info.width,
    height: info.height,
    bytes: info.size,
  };
}

export function isImage(mime) {
  return /^image\/(jpe?g|png|webp|avif|gif|tiff?|bmp)$/i.test(mime || "");
}

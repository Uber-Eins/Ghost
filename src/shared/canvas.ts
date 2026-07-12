import { fnv1a } from "./hash";

const FARBLE_SAMPLE_MASK = 0x07;

export interface CanvasRasterContext {
  data: Uint8ClampedArray<ArrayBufferLike>;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export function farbleCanvasPixels(
  source: Uint8ClampedArray<ArrayBufferLike>,
  width: number,
  height: number,
  seed: string,
  originX: number,
  originY: number,
  rasterContext: CanvasRasterContext
): Uint8ClampedArray<ArrayBuffer> {
  const output = new Uint8ClampedArray(source);
  const normalizedWidth = Math.max(0, Math.trunc(width));
  const normalizedHeight = Math.max(0, Math.trunc(height));
  const availablePixels = Math.floor(source.length / 4);
  const pixelCount = Math.min(availablePixels, normalizedWidth * normalizedHeight);
  if (normalizedWidth === 0 || normalizedHeight === 0 || pixelCount === 0) {
    return output;
  }

  const seedHash = fnv1a(`${seed}:canvas`);
  const normalizedOriginX = finiteInteger(originX);
  const normalizedOriginY = finiteInteger(originY);
  const variationContext = normalizeRasterContext(rasterContext);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const x = pixel % normalizedWidth;
    const y = Math.floor(pixel / normalizedWidth);
    const offset = pixel * 4;
    const hash = coordinateHash(seedHash, normalizedOriginX + x, normalizedOriginY + y);
    if ((hash & FARBLE_SAMPLE_MASK) !== 0) {
      continue;
    }
    // Flat fills are exact Canvas primitives, while raster variation carries
    // the renderer-specific entropy that farbling is meant to disguise.
    if (!hasVisibleRasterVariation(variationContext, normalizedOriginX + x, normalizedOriginY + y)) {
      continue;
    }

    const alpha = source[offset + 3];
    if (alpha > 0 && alpha < 255) {
      output[offset + 3] = clampByte(alpha + signedStep(hash >>> 8));
      continue;
    }

    for (let channel = 0; channel < 3; channel += 1) {
      const value = source[offset + channel];
      if (value > 0 && value < 255) {
        output[offset + channel] = clampByte(value + signedStep(hash >>> (11 + channel * 3)));
      }
    }
  }
  return output;
}

function hasVisibleRasterVariation(
  context: CanvasRasterContext,
  canvasX: number,
  canvasY: number
): boolean {
  const x = canvasX - context.originX;
  const y = canvasY - context.originY;
  if (x < 0 || x >= context.width || y < 0 || y >= context.height) {
    return false;
  }
  const offset = (y * context.width + x) * 4;
  const data = context.data;
  if (offset + 3 >= data.length) {
    return false;
  }
  if (data[offset + 3] === 0) {
    return false;
  }

  return (
    (x > 0 && visiblyDiffers(data, offset, offset - 4))
    || (x + 1 < context.width && visiblyDiffers(data, offset, offset + 4))
    || (y > 0 && visiblyDiffers(data, offset, offset - context.width * 4))
    || (y + 1 < context.height && visiblyDiffers(data, offset, offset + context.width * 4))
  );
}

function normalizeRasterContext(
  context: CanvasRasterContext
): CanvasRasterContext {
  return {
    data: context.data,
    width: Math.max(0, Math.trunc(context.width)),
    height: Math.max(0, Math.trunc(context.height)),
    originX: finiteInteger(context.originX),
    originY: finiteInteger(context.originY)
  };
}

function visiblyDiffers(data: Uint8ClampedArray<ArrayBufferLike>, left: number, right: number): boolean {
  if (data[right + 3] === 0) {
    return false;
  }
  return data[left] !== data[right]
    || data[left + 1] !== data[right + 1]
    || data[left + 2] !== data[right + 2]
    || data[left + 3] !== data[right + 3];
}

function coordinateHash(seed: number, x: number, y: number): number {
  let hash = seed ^ Math.imul(x, 0x9e3779b1) ^ Math.imul(y, 0x85ebca77);
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function signedStep(value: number): number {
  return value % 3 - 1;
}

function finiteInteger(value: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : 0;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}

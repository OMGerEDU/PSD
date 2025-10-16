import fs from "node:fs/promises";

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function ensureUint8Array(data, width, height) {
  if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
    if (data.length === width * height * 4) {
      return new Uint8ClampedArray(data);
    }
  }
  throw new Error("invalid image data length");
}

function encodeBitmapPayload(bitmap, format) {
  const payload = {
    version: 1,
    width: bitmap.width,
    height: bitmap.height,
    format,
    data: Buffer.from(bitmap.data).toString("base64")
  };
  return Buffer.from(JSON.stringify(payload), "utf-8");
}

function decodeBitmapPayload(buffer) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf-8"));
  } catch {
    throw new Error("invalid image buffer");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("invalid image buffer");
  const { width, height, data, format } = parsed;
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("invalid image dimensions");
  if (typeof data !== "string") throw new Error("invalid image payload");
  const raw = Buffer.from(data, "base64");
  if (raw.length !== width * height * 4) throw new Error("invalid image payload length");
  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
    data: new Uint8ClampedArray(raw),
    format: format === "jpeg" ? "jpeg" : "png"
  };
}

function scaleNearest(bitmap, newWidth, newHeight) {
  const dst = new Uint8ClampedArray(newWidth * newHeight * 4);
  const xRatio = bitmap.width / newWidth;
  const yRatio = bitmap.height / newHeight;
  for (let y = 0; y < newHeight; y++) {
    const srcY = Math.min(bitmap.height - 1, Math.floor(y * yRatio));
    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.min(bitmap.width - 1, Math.floor(x * xRatio));
      const srcIdx = (srcY * bitmap.width + srcX) * 4;
      const dstIdx = (y * newWidth + x) * 4;
      dst[dstIdx] = bitmap.data[srcIdx];
      dst[dstIdx + 1] = bitmap.data[srcIdx + 1];
      dst[dstIdx + 2] = bitmap.data[srcIdx + 2];
      dst[dstIdx + 3] = bitmap.data[srcIdx + 3];
    }
  }
  return new Bitmap(newWidth, newHeight, dst, bitmap.format);
}

function crop(bitmap, left, top, width, height) {
  const dst = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const srcY = top + y;
    if (srcY < 0 || srcY >= bitmap.height) continue;
    for (let x = 0; x < width; x++) {
      const srcX = left + x;
      if (srcX < 0 || srcX >= bitmap.width) continue;
      const srcIdx = (srcY * bitmap.width + srcX) * 4;
      const dstIdx = (y * width + x) * 4;
      dst[dstIdx] = bitmap.data[srcIdx];
      dst[dstIdx + 1] = bitmap.data[srcIdx + 1];
      dst[dstIdx + 2] = bitmap.data[srcIdx + 2];
      dst[dstIdx + 3] = bitmap.data[srcIdx + 3];
    }
  }
  return new Bitmap(width, height, dst, bitmap.format);
}

function fillBackground(width, height, color) {
  const dst = new Uint8ClampedArray(width * height * 4);
  const r = clampByte(color?.r ?? 0);
  const g = clampByte(color?.g ?? 0);
  const b = clampByte(color?.b ?? 0);
  const a = clampByte(color?.a ?? 0);
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = a;
  }
  return dst;
}

function blitAlpha(target, source, offsetX, offsetY) {
  for (let y = 0; y < source.height; y++) {
    const destY = offsetY + y;
    if (destY < 0 || destY >= target.height) continue;
    for (let x = 0; x < source.width; x++) {
      const destX = offsetX + x;
      if (destX < 0 || destX >= target.width) continue;
      const srcIdx = (y * source.width + x) * 4;
      const dstIdx = (destY * target.width + destX) * 4;
      const srcA = source.data[srcIdx + 3] / 255;
      const dstA = target.data[dstIdx + 3] / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA <= 0) {
        target.data[dstIdx] = 0;
        target.data[dstIdx + 1] = 0;
        target.data[dstIdx + 2] = 0;
        target.data[dstIdx + 3] = 0;
        continue;
      }
      const srcR = source.data[srcIdx];
      const srcG = source.data[srcIdx + 1];
      const srcB = source.data[srcIdx + 2];
      const dstR = target.data[dstIdx];
      const dstG = target.data[dstIdx + 1];
      const dstB = target.data[dstIdx + 2];
      const outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA;
      const outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA;
      const outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA;
      target.data[dstIdx] = clampByte(outR);
      target.data[dstIdx + 1] = clampByte(outG);
      target.data[dstIdx + 2] = clampByte(outB);
      target.data[dstIdx + 3] = clampByte(outA * 255);
    }
  }
}

export class Bitmap {
  constructor(width, height, data, format = "png") {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.data = ensureUint8Array(data ?? fillBackground(this.width, this.height, { r: 0, g: 0, b: 0, a: 0 }), this.width, this.height);
    this.format = format === "jpeg" ? "jpeg" : "png";
  }

  static create(width, height, color) {
    const data = fillBackground(width, height, color);
    return new Bitmap(width, height, data, "png");
  }

  static fromBuffer(buffer) {
    const decoded = decodeBitmapPayload(buffer);
    return new Bitmap(decoded.width, decoded.height, decoded.data, decoded.format);
  }

  clone() {
    return new Bitmap(this.width, this.height, new Uint8ClampedArray(this.data), this.format);
  }

  metadata() {
    return { width: this.width, height: this.height, format: this.format };
  }

  ensureAlpha() {
    return this;
  }

  withMetadata() {
    return this;
  }

  rotate() {
    return this;
  }

  resizeCover(targetWidth, targetHeight) {
    const scale = Math.max(targetWidth / this.width, targetHeight / this.height);
    const resized = this.scaleTo(Math.max(1, Math.round(this.width * scale)), Math.max(1, Math.round(this.height * scale)));
    const left = Math.floor((resized.width - targetWidth) / 2);
    const top = Math.floor((resized.height - targetHeight) / 2);
    return crop(resized, left, top, targetWidth, targetHeight);
  }

  resizeContain(targetWidth, targetHeight) {
    const scale = Math.min(targetWidth / this.width, targetHeight / this.height);
    const width = Math.max(1, Math.round(this.width * scale));
    const height = Math.max(1, Math.round(this.height * scale));
    return this.scaleTo(width, height);
  }

  scaleTo(width, height) {
    return scaleNearest(this, width, height);
  }

  padTo(targetWidth, targetHeight, background) {
    const offsetX = Math.floor((targetWidth - this.width) / 2);
    const offsetY = Math.floor((targetHeight - this.height) / 2);
    const data = fillBackground(targetWidth, targetHeight, background);
    const result = new Bitmap(targetWidth, targetHeight, data, this.format);
    result.blit(this, offsetX, offsetY);
    return result;
  }

  blit(bitmap, offsetX, offsetY) {
    for (let y = 0; y < bitmap.height; y++) {
      const destY = offsetY + y;
      if (destY < 0 || destY >= this.height) continue;
      for (let x = 0; x < bitmap.width; x++) {
        const destX = offsetX + x;
        if (destX < 0 || destX >= this.width) continue;
        const srcIdx = (y * bitmap.width + x) * 4;
        const dstIdx = (destY * this.width + destX) * 4;
        this.data[dstIdx] = bitmap.data[srcIdx];
        this.data[dstIdx + 1] = bitmap.data[srcIdx + 1];
        this.data[dstIdx + 2] = bitmap.data[srcIdx + 2];
        this.data[dstIdx + 3] = bitmap.data[srcIdx + 3];
      }
    }
    return this;
  }

  composite(overlays) {
    for (const overlay of overlays) {
      if (!overlay || !overlay.image) continue;
      blitAlpha(this, overlay.image, overlay.left ?? 0, overlay.top ?? 0);
    }
    return this;
  }

  flatten(background) {
    const r = clampByte(background?.r ?? 255);
    const g = clampByte(background?.g ?? 255);
    const b = clampByte(background?.b ?? 255);
    for (let i = 0; i < this.data.length; i += 4) {
      const alpha = this.data[i + 3] / 255;
      this.data[i] = clampByte(this.data[i] * alpha + r * (1 - alpha));
      this.data[i + 1] = clampByte(this.data[i + 1] * alpha + g * (1 - alpha));
      this.data[i + 2] = clampByte(this.data[i + 2] * alpha + b * (1 - alpha));
      this.data[i + 3] = 255;
    }
    return this;
  }

  raw() {
    return {
      data: Buffer.from(this.data),
      info: { width: this.width, height: this.height, channels: 4 }
    };
  }

  pixelAt(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return { r: 0, g: 0, b: 0, a: 0 };
    }
    const idx = (y * this.width + x) * 4;
    return {
      r: this.data[idx],
      g: this.data[idx + 1],
      b: this.data[idx + 2],
      a: this.data[idx + 3]
    };
  }

  setFormat(format) {
    this.format = format === "jpeg" ? "jpeg" : "png";
    return this;
  }

  toBuffer(format = this.format) {
    this.format = format === "jpeg" ? "jpeg" : "png";
    return encodeBitmapPayload(this, this.format);
  }

  async toFile(filePath, format = this.format) {
    const buf = this.toBuffer(format);
    await fs.writeFile(filePath, buf);
  }
}

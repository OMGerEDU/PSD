import { fetchBuffer } from "../utils/http.js";
import { config } from "../config.js";
import { parseHexColor } from "./colors.js";
import { Bitmap } from "./bitmap.js";

function ensureDimensions(image, label) {
  if (!image.width || !image.height) {
    throw new Error(`invalid ${label} dimensions`);
  }
  if (image.width * image.height > config.maxInputPixels) {
    throw new Error(`${label} exceeds max pixels`);
  }
}

function clampDimensions(value) {
  return Math.max(1, Math.round(value));
}

function roundPosition(value) {
  if (Number.isFinite(value)) {
    return Math.round(value);
  }
  return 0;
}

export async function composeImage(templateUrl, map, replacements) {
  const templateBuf = await fetchBuffer(templateUrl);
  const template = Bitmap.fromBuffer(templateBuf).ensureAlpha().withMetadata();
  ensureDimensions(template, "template");

  const overlays = [];

  for (const slot of map.slots ?? []) {
    const assetUrl = replacements[slot.name];
    if (!assetUrl) continue;

    const assetBuf = await fetchBuffer(assetUrl);
    let image = Bitmap.fromBuffer(assetBuf).ensureAlpha();
    ensureDimensions(image, slot.name);

    const maxSide = Math.max(image.width, image.height);
    if (maxSide > config.maxSide) {
      const scale = config.maxSide / maxSide;
      const newWidth = Math.max(1, Math.floor(image.width * scale));
      const newHeight = Math.max(1, Math.floor(image.height * scale));
      image = image.scaleTo(newWidth, newHeight);
    }

    const targetWidth = clampDimensions(slot.width);
    const targetHeight = clampDimensions(slot.height);

    let prepared;
    if (slot.fit === "cover") {
      prepared = image.resizeCover(targetWidth, targetHeight);
    } else {
      const contain = image.resizeContain(targetWidth, targetHeight);
      const padColor = parseHexColor(slot.background ?? "#00000000");
      prepared = contain.padTo(targetWidth, targetHeight, padColor);
    }

    overlays.push({
      image: prepared,
      left: roundPosition(slot.left),
      top: roundPosition(slot.top)
    });
  }

  const result = template.clone().composite(overlays);

  const fmt = map.output?.format === "jpeg" ? "jpeg" : "png";
  if (fmt === "jpeg") {
    result.flatten({ r: 255, g: 255, b: 255 }).setFormat("jpeg");
  } else {
    result.setFormat("png");
  }

  return result.toBuffer(fmt);
}

export function validateSlotsExist(map, replacements) {
  const valid = new Set((map.slots ?? []).map(slot => slot.name));
  for (const key of Object.keys(replacements ?? {})) {
    if (!valid.has(key)) {
      throw new Error(`unknown slot '${key}'`);
    }
  }
}

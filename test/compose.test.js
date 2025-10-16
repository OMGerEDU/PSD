import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { composeImage } from "../src/core/compositor.js";
import { Bitmap } from "../src/core/bitmap.js";

async function createSolidImage(filePath, width, height, color) {
  const image = Bitmap.create(width, height, color);
  await image.toFile(filePath);
}

test("composeImage overlays cover and contain slots with local files", async t => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "compose-test-"));
  t.after(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const templatePath = path.join(tmp, "template.img");
  await createSolidImage(templatePath, 400, 300, { r: 240, g: 240, b: 240, a: 255 });

  const coverAssetPath = path.join(tmp, "cover.img");
  await createSolidImage(coverAssetPath, 320, 120, { r: 255, g: 0, b: 0, a: 255 });

  const containAssetPath = path.join(tmp, "contain.img");
  await createSolidImage(containAssetPath, 120, 60, { r: 0, g: 0, b: 255, a: 255 });

  const map = {
    slots: [
      { name: "Cover", left: 0, top: 0, width: 200, height: 200, fit: "cover" },
      { name: "Contain", left: 200, top: 0, width: 200, height: 200, fit: "contain", background: "#00ff00ff" }
    ],
    output: { format: "png", quality: 90 }
  };

  const result = await composeImage(pathToFileURL(templatePath).toString(), map, {
    Cover: pathToFileURL(coverAssetPath).toString(),
    Contain: pathToFileURL(containAssetPath).toString()
  });

  const image = Bitmap.fromBuffer(result);
  const meta = image.metadata();
  assert.equal(meta.width, 400);
  assert.equal(meta.height, 300);
  assert.equal(meta.format, "png");

  const coverPixel = image.pixelAt(10, 10);
  assert.deepEqual(coverPixel, { r: 255, g: 0, b: 0, a: 255 });

  const containTop = image.pixelAt(350, 10);
  const containBottom = image.pixelAt(350, 190);
  const containCenter = image.pixelAt(350, 100);

  assert.deepEqual(containTop, { r: 0, g: 255, b: 0, a: 255 });
  assert.deepEqual(containBottom, { r: 0, g: 255, b: 0, a: 255 });
  assert.deepEqual(containCenter, { r: 0, g: 0, b: 255, a: 255 });
});

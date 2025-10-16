import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { setRegistryOverrideForTests } from "../src/repos/templateRepo.js";
import { buildServer } from "../src/server.js";
import { Bitmap } from "../src/core/bitmap.js";

async function createSolidImage(filePath, width, height, color) {
  const image = Bitmap.create(width, height, color);
  await image.toFile(filePath);
}

test("/render outputFormat override does not persist across requests", async t => {
  process.env.NODE_ENV = "test";

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "render-route-"));
  t.after(async () => {
    setRegistryOverrideForTests(null);
    await fs.rm(tmp, { recursive: true, force: true });
  });

  const templatePath = path.join(tmp, "template.img");
  await createSolidImage(templatePath, 120, 120, { r: 200, g: 200, b: 200, a: 255 });
  const assetPath = path.join(tmp, "asset.img");
  await createSolidImage(assetPath, 80, 40, { r: 20, g: 20, b: 20, a: 255 });

  const templateUrl = pathToFileURL(templatePath).toString();
  const assetUrl = pathToFileURL(assetPath).toString();

  const registry = {
    fixture: {
      templateUrl,
      map: {
        slots: [
          {
            name: "Slot",
            left: 10,
            top: 10,
            width: 80,
            height: 80,
            fit: "contain",
            background: "#ffffffff"
          }
        ],
        output: { format: "png", quality: 90 }
      }
    }
  };

  setRegistryOverrideForTests(registry);

  const app = buildServer();
  await app.ready();
  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: "POST",
    url: "/render",
    payload: {
      templateId: "fixture",
      replacements: { Slot: assetUrl },
      outputFormat: "jpeg"
    },
    headers: { "content-type": "application/json" }
  });

  assert.equal(first.statusCode, 200);
  assert.equal(first.headers["content-type"], "image/jpeg");
  const firstImage = Bitmap.fromBuffer(first.rawPayload ?? Buffer.from(first.body ?? ""));
  assert.equal(firstImage.metadata().format, "jpeg");

  const second = await app.inject({
    method: "POST",
    url: "/render",
    payload: {
      templateId: "fixture",
      replacements: { Slot: assetUrl }
    },
    headers: { "content-type": "application/json" }
  });

  assert.equal(second.statusCode, 200);
  assert.equal(second.headers["content-type"], "image/png");
  const secondImage = Bitmap.fromBuffer(second.rawPayload ?? Buffer.from(second.body ?? ""));
  assert.equal(secondImage.metadata().format, "png");
});

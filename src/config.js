import fs from "node:fs";
import path from "node:path";

const ENV_LOADED = new Set();

function loadEnvFile(filePath) {
  const resolved = path.resolve(process.cwd(), filePath);
  if (ENV_LOADED.has(resolved)) return;
  ENV_LOADED.add(resolved);
  try {
    const text = fs.readFileSync(resolved, "utf-8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const rawValue = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) {
        const unquoted = rawValue.replace(/^['"]|['"]$/g, "");
        process.env[key] = unquoted;
      }
    }
  } catch (err) {
    if (err && err.code !== "ENOENT") throw err;
  }
}

loadEnvFile(".env");

function int(v, d) {
  const n = v ? parseInt(v, 10) : d;
  return Number.isFinite(n) ? n : d;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: int(process.env.PORT, 8080),
  host: process.env.HOST ?? "127.0.0.1",
  templateRegistryPath: process.env.TEMPLATE_REGISTRY ?? "./template-registry.json",
  maxInputPixels: int(process.env.MAX_INPUT_PIXELS, 268435456),
  maxSide: int(process.env.MAX_SIDE, 6000)
};

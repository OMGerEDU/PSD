import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

let cache = null;
let override = null;

export async function loadRegistry() {
  if (override) return override;
  if (cache) return cache;
  const registryPath = path.resolve(process.cwd(), config.templateRegistryPath);
  const text = await fs.readFile(registryPath, "utf-8");
  cache = JSON.parse(text);
  return cache;
}

export async function getTemplate(templateId) {
  const registry = await loadRegistry();
  const template = registry[templateId];
  if (!template) throw new Error(`template '${templateId}' not found`);
  return JSON.parse(JSON.stringify(template));
}

export function setRegistryOverrideForTests(registry) {
  override = registry;
  cache = null;
}

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCHEME_REGEX = /^[a-zA-Z][a-zA-Z\d+\-.]*:/;

async function readLocalFile(p, maxBytes) {
  const filePath = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  const buf = await fs.readFile(filePath);
  if (buf.byteLength > maxBytes) throw new Error(`file too large > ${maxBytes} bytes: ${filePath}`);
  return buf;
}

export async function fetchBuffer(url, maxBytes = 50 * 1024 * 1024) {
  if (!SCHEME_REGEX.test(url)) {
    return readLocalFile(url, maxBytes);
  }

  if (url.startsWith("file://")) {
    const filePath = fileURLToPath(url);
    return readLocalFile(filePath, maxBytes);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const ab = await response.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error(`download too large > ${maxBytes} bytes: ${url}`);
  return Buffer.from(ab);
}

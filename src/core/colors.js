export function parseHexColor(hex) {
  if (!hex) return { r: 0, g: 0, b: 0, a: 0 };
  const value = hex.trim().replace(/^#/, "");
  if (!(value.length === 6 || value.length === 8)) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const a = value.length === 8 ? parseInt(value.slice(6, 8), 16) : 255;
  return { r, g, b, a };
}

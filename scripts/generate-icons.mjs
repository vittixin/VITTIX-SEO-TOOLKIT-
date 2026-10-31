#!/usr/bin/env node
/**
 * Generates the Vittix brand icons (16/32/48/96/128 px PNG) into
 * apps/extension/public/icon/.
 *
 * The mark is a white "V" on a rounded indigo square. Icons are rendered at
 * 4x supersampling and box-downsampled for basic anti-aliasing. Pure Node
 * (zlib), no external dependencies.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'apps/extension/public/icon');
const SIZES = [16, 32, 48, 96, 128];
const SS = 4; // supersample factor

const BG = [0x4f, 0x46, 0xe5]; // indigo-600
const FG = [0xff, 0xff, 0xff]; // white

// ---- PNG encoding -----------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- rasterization ----------------------------------------------------------

function insideRoundedRect(x, y, size, radius) {
  const minX = 0,
    minY = 0,
    maxX = size,
    maxY = size;
  if (x < minX || x > maxX || y < minY || y > maxY) return false;
  const cx = Math.min(Math.max(x, minX + radius), maxX - radius);
  const cy = Math.min(Math.max(y, minY + radius), maxY - radius);
  const dx = x - cx,
    dy = y - cy;
  return (
    dx * dx + dy * dy <= radius * radius ||
    (x >= minX + radius && x <= maxX - radius) ||
    (y >= minY + radius && y <= maxY - radius)
  );
}

/** Convex quad via consistent cross-product signs. */
function insideQuad(px, py, quad) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [x1, y1] = quad[i];
    const [x2, y2] = quad[(i + 1) % 4];
    const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign !== 0 && s !== sign) return false;
      sign = s;
    }
  }
  return true;
}

function strokeQuad(p1, p2, halfWidth) {
  const dx = p2[0] - p1[0],
    dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * halfWidth,
    ny = (dx / len) * halfWidth;
  return [
    [p1[0] + nx, p1[1] + ny],
    [p2[0] + nx, p2[1] + ny],
    [p2[0] - nx, p2[1] - ny],
    [p1[0] - nx, p1[1] - ny],
  ];
}

function renderIcon(size) {
  const s = size * SS;
  const radius = s * 0.22;
  const strokeW = s * 0.115;
  const left = strokeQuad([s * 0.3, s * 0.26], [s * 0.5, s * 0.79], strokeW);
  const right = strokeQuad([s * 0.5, s * 0.79], [s * 0.7, s * 0.26], strokeW);

  // 0 = outside the rounded rect, 1 = background, 2 = stroke (foreground)
  const mask = new Uint8Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      if (!insideRoundedRect(x + 0.5, y + 0.5, s, radius)) continue;
      mask[y * s + x] = 1;
      if (insideQuad(x + 0.5, y + 0.5, left) || insideQuad(x + 0.5, y + 0.5, right)) {
        mask[y * s + x] = 2;
      }
    }
  }

  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let inside = 0;
      let stroke = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const value = mask[(y * SS + sy) * s + (x * SS + sx)];
          if (value >= 1) inside += 1;
          if (value === 2) stroke += 1;
        }
      }
      const insideCover = inside / (SS * SS);
      const strokeCover = stroke / (SS * SS);
      const bgCover = insideCover - strokeCover;
      const i = (y * size + x) * 4;
      out[i] = Math.round(FG[0] * strokeCover + BG[0] * bgCover);
      out[i + 1] = Math.round(FG[1] * strokeCover + BG[1] * bgCover);
      out[i + 2] = Math.round(FG[2] * strokeCover + BG[2] * bgCover);
      out[i + 3] = Math.round(insideCover * 255);
    }
  }
  return out;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const png = encodePng(size, size, renderIcon(size));
  const file = resolve(OUT_DIR, `${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}

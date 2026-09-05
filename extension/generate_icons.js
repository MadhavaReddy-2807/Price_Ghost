import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard CRC32 calculation for PNG chunks
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([len, crcData, crcBuf]);
}

function createPng(size) {
  const width = size;
  const height = size;
  
  // Create RGBA pixel buffer (size * size * 4 + size filter bytes)
  const rowBytes = width * 4 + 1;
  const raw = Buffer.alloc(height * rowBytes);

  const cx = width / 2;
  const cy = height / 2;
  const r = size * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    raw[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Deep purple to violet gradient (#4f46e5 to #7c3aed)
        const t = y / height;
        const red = Math.round(79 + (124 - 79) * t);
        const green = Math.round(70 + (58 - 70) * t);
        const blue = Math.round(229 + (237 - 229) * t);

        // Simple ghost eyes inside
        const eyeY = cy - size * 0.08;
        const leftEyeX = cx - size * 0.15;
        const rightEyeX = cx + size * 0.15;
        const eyeRadius = size * 0.09;

        const dLeft = Math.sqrt((x - leftEyeX) ** 2 + (y - eyeY) ** 2);
        const dRight = Math.sqrt((x - rightEyeX) ** 2 + (y - eyeY) ** 2);

        if (dLeft <= eyeRadius || dRight <= eyeRadius) {
          // White eye
          raw[pxOffset] = 255;
          raw[pxOffset + 1] = 255;
          raw[pxOffset + 2] = 255;
          raw[pxOffset + 3] = 255;
        } else {
          // Gradient background
          raw[pxOffset] = red;
          raw[pxOffset + 1] = green;
          raw[pxOffset + 2] = blue;
          raw[pxOffset + 3] = 255;
        }
      } else {
        // Transparent
        raw[pxOffset] = 0;
        raw[pxOffset + 1] = 0;
        raw[pxOffset + 2] = 0;
        raw[pxOffset + 3] = 0;
      }
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const idatData = zlib.deflateSync(raw);
  const idatChunk = makeChunk('IDAT', idatData);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

const iconsDir = path.resolve(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

fs.writeFileSync(path.join(iconsDir, 'icon16.png'), createPng(16));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), createPng(48));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), createPng(128));

console.log('[Icons] Generated icon16.png, icon48.png, icon128.png successfully!');

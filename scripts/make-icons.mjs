// Rasterizes the MotraMaster mark (two stacked accent bars on ink) into the PNG icons the PWA manifest needs.
// Node built-ins only (zlib for deflate). Run: node scripts/make-icons.mjs
// The maskable geometry mirrors public/pwa-maskable.svg (512-unit grid); public/favicon.svg is the transparent variant.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const BG = [0x18, 0x18, 0x1b] // ink
const FG = [0xec, 0x7a, 0x45] // accent (dark-theme value, for contrast on ink)
const SS = 4 // supersamples per axis

/** Two stacked bars of different length: a progression step. */
const BARS_32 = [
  { x: 7, y: 9.5, w: 10, h: 5, r: 1 },
  { x: 7, y: 17.5, w: 18, h: 5, r: 1 },
]

/** Standard icon: rounded ink tile on transparent canvas. */
const standard = {
  view: 32,
  rect: { x: 0, y: 0, w: 32, h: 32, r: 7 },
  bars: BARS_32,
}

/** Full-bleed ink tile with the mark inside the maskable safe zone. */
const maskable = {
  view: 512,
  rect: { x: 0, y: 0, w: 512, h: 512, r: 0 },
  bars: [
    { x: 136, y: 186, w: 134, h: 60, r: 10 },
    { x: 136, y: 266, w: 240, h: 60, r: 10 },
  ],
}

/** Full-bleed tile (iOS applies its own corner mask). */
const touch = { ...standard, rect: { x: 0, y: 0, w: 32, h: 32, r: 0 } }

function insideRoundedRect(px, py, { x, y, w, h, r }) {
  if (px < x || py < y || px > x + w || py > y + h) return false
  if (r <= 0) return true
  const cx = Math.min(Math.max(px, x + r), x + w - r)
  const cy = Math.min(Math.max(py, y + r), y + h - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function render(spec, size) {
  const scale = spec.view / size
  const out = Buffer.alloc(size * size * 4)
  const n = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let tile = 0
      let mark = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * scale
          const py = (y + (sy + 0.5) / SS) * scale
          if (insideRoundedRect(px, py, spec.rect)) {
            tile++
            if (spec.bars.some((b) => insideRoundedRect(px, py, b))) mark++
          }
        }
      }
      const i = (y * size + x) * 4
      if (tile === 0) continue
      const m = mark / tile
      for (let c = 0; c < 3; c++) out[i + c] = Math.round(BG[c] * (1 - m) + FG[c] * m)
      out[i + 3] = Math.round((tile / n) * 255)
    }
  }
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const targets = [
  ['pwa-192.png', standard, 192],
  ['pwa-512.png', standard, 512],
  ['pwa-maskable-512.png', maskable, 512],
  ['apple-touch-icon.png', touch, 180],
]

for (const [name, spec, size] of targets) {
  writeFileSync(publicDir + name, encodePng(render(spec, size), size))
  console.log(`wrote public/${name} (${size}x${size})`)
}

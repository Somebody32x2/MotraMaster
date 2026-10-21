// Rasterizes the MotraMaster mark into the PNG icons the PWA manifest needs.
// Node built-ins only (zlib for deflate). Run: node scripts/make-icons.mjs
// Geometry mirrors public/favicon.svg (32-unit grid) and public/pwa-maskable.svg (512-unit grid).
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const BG = [0x0b, 0x72, 0x68]
const FG = [0xf6, 0xf5, 0xf2]
const SS = 4 // supersamples per axis

/** Standard icon: rounded tile on transparent canvas. */
const standard = {
  view: 32,
  rect: { x: 0, y: 0, w: 32, h: 32, r: 7.5 },
  line: [[8, 22.5], [8, 10], [16, 17.5], [24, 10], [24, 22.5]],
  stroke: 3,
}

/** Full-bleed tile with the mark inside the maskable safe zone. */
const maskable = {
  view: 512,
  rect: { x: 0, y: 0, w: 512, h: 512, r: 0 },
  line: [[176, 336], [176, 176], [256, 251], [336, 176], [336, 336]],
  stroke: 30,
}

/** Full-bleed tile, larger mark (iOS applies its own corner mask). */
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

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2))
  const dx = px - (ax + t * vx)
  const dy = py - (ay + t * vy)
  return Math.sqrt(dx * dx + dy * dy)
}

function onLine(px, py, pts, half) {
  for (let i = 0; i < pts.length - 1; i++) {
    if (distToSegment(px, py, pts[i], pts[i + 1]) <= half) return true
  }
  return false
}

function render(spec, size) {
  const scale = spec.view / size
  const half = spec.stroke / 2
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
            if (onLine(px, py, spec.line, half)) mark++
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

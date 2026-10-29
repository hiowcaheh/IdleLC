/**
 * Little-endian reader for LC/Serious Engine files. `xint()` reads an obfuscated integer:
 * XOR with a 4-byte key that advances by `step` on every byte after each use (docs/lc-formats.md).
 */
export class Reader {
  constructor(buffer, offset = 0, key = null) {
    this.buf = buffer
    this.view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    this.o = offset
    this.key = key ? { bytes: Uint8Array.from(key.bytes), step: key.step } : null
  }

  get remaining() {
    return this.buf.length - this.o
  }

  u8() {
    return this.buf[this.o++]
  }

  u16() {
    const v = this.view.getUint16(this.o, true)
    this.o += 2
    return v
  }

  u32() {
    const v = this.view.getUint32(this.o, true)
    this.o += 4
    return v
  }

  i32() {
    const v = this.view.getInt32(this.o, true)
    this.o += 4
    return v
  }

  f32() {
    const v = this.view.getFloat32(this.o, true)
    this.o += 4
    return v
  }

  /** Obfuscated integer (requires a key). */
  xint() {
    const k = this.key.bytes
    const keyValue = (k[0] | (k[1] << 8) | (k[2] << 16) | (k[3] << 24)) >>> 0
    for (let i = 0; i < 4; i++) k[i] = (k[i] + this.key.step) & 0xff
    return (this.u32() ^ keyValue) >>> 0
  }

  floats(count) {
    const out = new Float32Array(count)
    for (let i = 0; i < count; i++) out[i] = this.f32()
    return out
  }

  u16s(count) {
    const out = new Uint16Array(count)
    for (let i = 0; i < count; i++) out[i] = this.u16()
    return out
  }

  bytes(count) {
    const out = this.buf.subarray(this.o, this.o + count)
    this.o += count
    return out
  }

  /** u32 length + latin1 bytes. */
  string() {
    const n = this.u32()
    if (n > this.remaining) throw new Error(`string length ${n} out of range at ${this.o - 4}`)
    return new TextDecoder('latin1').decode(this.bytes(n))
  }

  /** 4-character chunk id. */
  id() {
    return new TextDecoder('latin1').decode(this.bytes(4))
  }
}

export const MESH_KEY = { bytes: [0x65, 0x48, 0x35, 0x1e], step: 0x59 }
export const TEXTURE_KEY = { bytes: [0x3e, 0x3d, 0x14, 0x12], step: 0x43 }

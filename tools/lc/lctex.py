"""LC/Serious Engine .tex -> PNG: FRMS raw RGB/RGBA (first frame), FRMC DXT1/DXT5 (mip 0).

Usage: python3 lctex.py <in.tex> <out.png>  (see docs/lc-formats.md)"""
import struct, sys
from PIL import Image

def rgb565(c):
    r = (c >> 11) & 31; g = (c >> 5) & 63; b = c & 31
    return (r * 255 // 31, g * 255 // 63, b * 255 // 31)

def color_block(data, o, dxt1):
    c0, c1, idx = struct.unpack_from('<HHI', data, o)
    p0, p1 = rgb565(c0), rgb565(c1)
    if c0 > c1 or not dxt1:
        p2 = tuple((2 * a + b) // 3 for a, b in zip(p0, p1)); p3 = tuple((a + 2 * b) // 3 for a, b in zip(p0, p1))
        pal = [p0 + (255,), p1 + (255,), p2 + (255,), p3 + (255,)]
    else:
        p2 = tuple((a + b) // 2 for a, b in zip(p0, p1))
        pal = [p0 + (255,), p1 + (255,), p2 + (255,), (0, 0, 0, 0)]
    return [pal[(idx >> (2 * i)) & 3] for i in range(16)]

def alpha_block(data, o):
    a0, a1 = data[o], data[o + 1]
    bits = int.from_bytes(data[o + 2:o + 8], 'little')
    if a0 > a1: pal = [a0, a1] + [((6 - i) * a0 + (1 + i) * a1) // 7 for i in range(6)]
    else: pal = [a0, a1] + [((4 - i) * a0 + (1 + i) * a1) // 5 for i in range(4)] + [0, 255]
    return [pal[(bits >> (3 * i)) & 7] for i in range(16)]

def decode_dxt(data, w, h, dxt5):
    img = Image.new('RGBA', (w, h)); px = img.load(); o = 0
    for by in range(0, h, 4):
        for bx in range(0, w, 4):
            alpha = None
            if dxt5: alpha = alpha_block(data, o); o += 8
            cols = color_block(data, o, not dxt5); o += 8
            for i in range(16):
                x, y = bx + (i & 3), by + (i >> 2)
                if x < w and y < h:
                    r, g, b, a = cols[i]
                    px[x, y] = (r, g, b, alpha[i] if alpha else a)
    return img

def dxt_dims(sizes):
    """Find (width, height, is_dxt5) whose DXT mip chain matches the stored mip sizes."""
    for dxt5 in (False, True):
        block = 16 if dxt5 else 8
        for lw in range(0, 13):
            for lh in range(0, 13):
                w, h = 1 << lw, 1 << lh
                chain = [max(1, (w >> k) // 4 if (w >> k) >= 4 else 1) * max(1, (h >> k) // 4 if (h >> k) >= 4 else 1) * block
                         for k in range(len(sizes))]
                if chain == sizes and max(lw, lh) + 1 >= len(sizes):
                    return w, h, dxt5
    raise ValueError(f'no DXT layout matches mip sizes {sizes[:4]}...')

def read_tdat(b):
    """TDAT = mexWidth, mexShift, mexHeight, fineMips, flags, frames; XOR key stream
    starting at bytes 3e 3d 14 12, each byte +0x43 per integer."""
    i = b.find(b'TDAT') + 4
    if struct.unpack_from('<H', b, 6)[0] == 0:  # plain Serious Engine v4 header
        flags, mex_w, mex_h, mips, shift, frames = struct.unpack_from('<6I', b, i)
        return {'width': mex_w >> shift, 'height': mex_h >> shift, 'mips': mips, 'flags': flags, 'frames': frames}
    key = bytes.fromhex('3e3d1412'); vals = []
    for k in range(6):
        stored = struct.unpack_from('<I', b, i + 4 * k)[0]
        vals.append(stored ^ struct.unpack('<I', key)[0])
        key = bytes((x + 0x43) & 0xFF for x in key)
    mex_w, shift, mex_h, mips, flags, frames = vals
    return {'width': mex_w >> shift, 'height': mex_h >> shift, 'mips': mips, 'flags': flags, 'frames': frames}

def isqrt_pow2(n):
    s = int(round(n ** 0.5))
    return s if s * s == n else None

def convert(path, out):
    b = open(path, 'rb').read()
    i = b.find(b'FRMC'); j = b.find(b'FRMS')
    if i >= 0:
        total, mip0 = struct.unpack_from('<II', b, i + 4)
        o, sizes = i + 8, []
        while o < i + 8 + total:
            s = struct.unpack_from('<I', b, o)[0]; sizes.append(s); o += 4 + s
        w, h, dxt5 = dxt_dims(sizes)
        img = decode_dxt(b[i + 12:i + 12 + mip0], w, h, dxt5)
        kind = 'DXT5' if dxt5 else 'DXT1'
    else:
        t = read_tdat(b)
        w, h = t['width'], t['height']
        bpp = 4 if t['flags'] & 1 else 3
        raw = b[j + 4:j + 4 + w * h * bpp]  # first frame only
        img = Image.frombytes('RGBA' if bpp == 4 else 'RGB', (w, h), raw)
        kind = ('RGBA' if bpp == 4 else 'RGB') + (f" {t['frames']} frames" if t['frames'] > 1 else '')
    img.save(out)
    print(f'{path.split("/")[-1]} -> {out.split("/")[-1]} {kind} {img.size}')

if __name__ == '__main__':
    convert(sys.argv[1], sys.argv[2])

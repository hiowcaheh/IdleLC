"""LC mesh v17 (.bm) reader (see docs/lc-formats.md). Integers (counts) are XOR-ed with a key stream:
key starts at 0x1e354865 and every byte grows by 0x59 for each obfuscated integer read."""
import json, struct, sys

class Reader:
    def __init__(self, data, offset):
        self.b, self.o = data, offset
        self.key = bytes.fromhex('6548351e')  # little-endian 0x1e354865
    def _next_key(self):
        k = struct.unpack('<I', self.key)[0]
        self.key = bytes((x + 0x59) & 0xFF for x in self.key)
        return k
    def xint(self):
        v = struct.unpack_from('<I', self.b, self.o)[0] ^ self._next_key(); self.o += 4
        return v
    def raw(self, fmt):
        v = struct.unpack_from('<' + fmt, self.b, self.o); self.o += struct.calcsize('<' + fmt)
        return v
    def string(self):
        n = self.raw('I')[0]; s = self.b[self.o:self.o + n].decode('latin1'); self.o += n
        return s

def parse(path):
    data = open(path, 'rb').read()
    assert data[:4] == b'MESH' and struct.unpack_from('<I', data, 4)[0] == 17
    r = Reader(data, 12)
    lods = []
    for _ in range(r.xint()):
        ctvx, ctwm, ctuv, ctvx2, ctsf, ctmm = (r.xint() for _ in range(6))
        assert ctvx == ctvx2, (ctvx, ctvx2)
        lod = {'src': r.string(), 'maxDistance': r.raw('f')[0], 'flags': r.xint()}
        lod['positions'] = r.raw(f'{ctvx * 3}f')
        lod['normals'] = r.raw(f'{ctvx * 3}f')
        lod['uvmaps'] = [{'name': r.string(), 'uvs': r.raw(f'{ctvx * 2}f')} for _ in range(ctuv)]
        lod['surfaces'] = []
        for _ in range(ctsf):
            first, count, ctt = r.xint(), r.xint(), r.xint()
            tris = r.raw(f'{ctt * 3}H')
            name = r.string()
            unknown0 = r.xint()
            palette = list(r.raw(f'{r.xint()}B'))
            surf = {'name': name, 'first': first, 'count': count, 'tris': tris, 'bonePalette': palette, 'u0': unknown0}
            if r.xint():
                ct_tc, ct_col, ct_tex, ct_flt = r.xint(), r.xint(), r.xint(), r.xint()
                surf['shader'] = r.string()
                surf['textures'] = [r.string() for _ in range(ct_tex)]
                surf['texcoords'] = [r.xint() for _ in range(ct_tc)]
                surf['colors'] = [r.xint() for _ in range(ct_col)]
                surf['floats'] = list(r.raw(f'{ct_flt}f'))
                surf['shaderFlags'] = r.xint()
            lod['surfaces'].append(surf)
        lod['weightmaps'] = []
        for _ in range(ctwm):
            name = r.string()
            ctw = r.xint()
            flat = r.raw(f'{"If" * ctw}')
            lod['weightmaps'].append({'bone': name, 'weights': list(zip(flat[0::2], flat[1::2]))})
        assert ctmm == 0, 'morph maps not supported yet'
        # per-vertex GPU skinning data: 4 bone slots (palette indices) + 4 byte weights
        skin = r.raw(f'{ctvx * 8}B')
        lod['skinBones'] = [skin[i * 8:i * 8 + 4] for i in range(ctvx)]
        lod['skinWeights'] = [skin[i * 8 + 4:i * 8 + 8] for i in range(ctvx)]
        lods.append(lod)
    return {'lods': lods, 'end': r.o, 'size': len(data)}

if __name__ == '__main__':
    m = parse(sys.argv[1]); lod = m['lods'][0]
    print(f"{lod['src']}: {len(lod['positions']) // 3} vx, flags={lod['flags']:#x}, end {m['end']}/{m['size']}")
    for s in lod['surfaces']:
        print(f"  surface {s['name']!r}: first {s['first']} count {s['count']} tris {len(s['tris']) // 3} shader {s.get('shader')} tex {s.get('textures')} tc {s.get('texcoords')} col {[hex(c) for c in s.get('colors', [])]} flt {s.get('floats')} u0={s['u0']} flags={s.get('shaderFlags', 0):#x}")
    wm = lod['weightmaps']
    print(f"  weightmaps: {len(wm)}: " + ', '.join(f"{w['bone']}({len(w['weights'])})" for w in wm[:8]) + ' ...')
    if len(sys.argv) > 2: json.dump(m, open(sys.argv[2], 'w'))

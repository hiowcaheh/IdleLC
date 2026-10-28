"""Serious Engine SKA skeleton (.bs v6) and animset (.ba v14) readers (plain, not obfuscated)."""
import struct, sys

class R:
    def __init__(self, b): self.b, self.o = b, 0
    def f(self, fmt):
        v = struct.unpack_from('<' + fmt, self.b, self.o); self.o += struct.calcsize('<' + fmt); return v
    def i(self): return self.f('i')[0]
    def s(self):
        n = self.i(); v = self.b[self.o:self.o + n].decode('latin1'); self.o += n; return v

def read_skeleton(path):
    r = R(open(path, 'rb').read())
    assert r.b[:4] == b'SKEL'; r.o = 4
    ver = r.i(); assert ver == 6, ver
    lods = []
    for _ in range(r.i()):
        src = r.s(); maxd = r.f('f')[0]
        bones = []
        for _ in range(r.i()):
            name, parent = r.s(), r.s()
            absm = r.f('12f')
            rel = r.f('7f')
            offlen, blen = r.f('2f')
            bones.append({'name': name, 'parent': parent, 'abs': absm, 'relPos': rel[:3], 'relRot': rel[3:], 'offLen': offlen, 'len': blen})
        lods.append({'src': src, 'bones': bones})
    assert r.o == len(r.b), (r.o, len(r.b))
    return lods

def read_animset(path):
    r = R(open(path, 'rb').read())
    assert r.b[:4] == b'ANIM'; r.o = 4
    ver = r.i(); assert ver == 14, ver
    anims = []
    for _ in range(r.i()):
        a = {'src': r.s(), 'name': r.s()}
        a['spf'], = r.f('f'); a['frames'] = r.i(); a['threshold'], = r.f('f')
        a['compressed'] = r.i(); a['customSpeed'] = r.i()
        assert not a['compressed'], 'compressed anims not supported'
        bones = []
        for _ in range(r.i()):
            be = {'bone': r.s(), 'default': r.f('12f')}
            pos = []
            for _ in range(r.i()):
                fr, _pad = r.f('HH'); pos.append((fr, r.f('3f')))
            rot = []
            for _ in range(r.i()):
                fr, _pad = r.f('HH'); rot.append((fr, r.f('4f')))
            be['pos'], be['rot'] = pos, rot
            be['offLen'], = r.f('f')
            bones.append(be)
        morphs = []
        for _ in range(r.i()):
            name = r.s(); n = r.i(); morphs.append((name, r.f(f'{n}f')))
        a['bones'], a['morphs'] = bones, morphs
        anims.append(a)
    assert r.o == len(r.b), (r.o, len(r.b))
    return anims

if __name__ == '__main__':
    sk = read_skeleton(sys.argv[1])
    b = sk[0]['bones']
    print(f'skeleton: {len(sk)} lod(s), {len(b)} bones; first: ' + ', '.join(f"{x['name']}<-{x['parent'] or '-'}" for x in b[:6]))
    print('bone0 abs', [round(v, 3) for v in b[0]['abs']], 'relPos', [round(v, 3) for v in b[0]['relPos']], 'relRot', [round(v, 3) for v in b[0]['relRot']])
    print('bone1 abs', [round(v, 3) for v in b[1]['abs']], 'relPos', [round(v, 3) for v in b[1]['relPos']], 'relRot', [round(v, 3) for v in b[1]['relRot']])
    an = read_animset(sys.argv[2])
    print(f'animset: {len(an)} anims: ' + ', '.join(f"{a['name']}({a['frames']}f, {len(a['bones'])} bones, pos keys b0={len(a['bones'][0]['pos'])}, rot keys b0={len(a['bones'][0]['rot'])})" for a in an))

"""Assemble an LC model (.smc) into an intermediate JSON + PNG textures for json2glb.mjs.

Usage: python3 lc2json.py <model.smc> <client root containing Data/> <out/model.json> [anim1,anim2,...]
Prototype (spike) — to be ported to Node as `npm run convert-lc`. See docs/lc-formats.md."""
import json, os, re, sys, importlib.util
here = os.path.dirname(os.path.abspath(__file__))
def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(here, name + '.py'))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
lcmesh, lcska, lctex = load('lcmesh'), load('lcska'), load('lctex')

_index = {}
def resolve(client_root, lc_path):
    """Case-insensitive lookup of a client-relative path like Data\\monster\\Fox.bm;
    falls back to a unique basename match anywhere under the client root."""
    found = _resolve_exact(client_root, lc_path)
    if found: return found
    if client_root not in _index:
        _index[client_root] = {}
        for d, _, files in os.walk(client_root):
            for f in files: _index[client_root].setdefault(f.lower(), os.path.join(d, f))
    return _index[client_root].get(lc_path.replace('\\', '/').split('/')[-1].lower())

def _resolve_exact(client_root, lc_path):
    cur = client_root
    for part in lc_path.replace('\\', '/').split('/'):
        if not part: continue
        entries = {e.lower(): e for e in os.listdir(cur)}
        if part.lower() not in entries: return None
        cur = os.path.join(cur, entries[part.lower()])
    return cur

def parse_smc(text):
    meshes, cur = [], None
    for line in text.replace('{', '\n').replace('}', '\n').splitlines():
        line = line.strip()
        m = re.match(r'MESH\s+TFNM\s+"([^"]+)"', line)
        if m: cur = {'file': m.group(1), 'textures': {}}; meshes.append(cur); continue
        m = re.match(r'"([^"]+)"\s+TFNM\s+"([^"]+)"', line)
        if m and cur is not None: cur['textures'][m.group(1)] = m.group(2); continue
    m = re.search(r'SKELETON\s+TFNM\s+"([^"]+)"', text)
    skel = m.group(1) if m else None
    animsets = re.findall(r'ANIMSET\s+TFNM\s+"([^"]+)"', text)
    off = re.search(r'OFFSET\s+([-\d.,\s]+);', text)
    offset = [float(x) for x in off.group(1).split(',')] if off else [0] * 6
    return meshes, skel, animsets, offset

def quat_xyzw(q):  # SE stores (w, x, y, z)
    return [q[1], q[2], q[3], q[0]]

def mat4_from12(m):  # SE row-major 3x4 -> 4x4 rows
    return [[m[0], m[1], m[2], m[3]], [m[4], m[5], m[6], m[7]], [m[8], m[9], m[10], m[11]], [0, 0, 0, 1]]

def invert_rigid(M):
    R = [[M[j][i] for j in range(3)] for i in range(3)]  # transpose of rotation
    t = [M[0][3], M[1][3], M[2][3]]
    it = [-sum(R[i][k] * t[k] for k in range(3)) for i in range(3)]
    return [R[0] + [it[0]], R[1] + [it[1]], R[2] + [it[2]], [0, 0, 0, 1]]

def colmajor(M): return [M[r][c] for c in range(4) for r in range(4)]

def build(smc_path, client_root, out_dir, include_anims=None):
    meshes, skel_path, animsets, offset = parse_smc(open(smc_path, encoding='latin1').read())
    os.makedirs(out_dir, exist_ok=True)
    sk = lcska.read_skeleton(resolve(client_root, skel_path))[0]['bones'] if skel_path else []
    index = {b['name']: i for i, b in enumerate(sk)}
    bones = [{'name': b['name'], 'parent': index.get(b['parent'], -1), 't': list(b['relPos']), 'r': quat_xyzw(b['relRot']),
              'ibm': colmajor(invert_rigid(mat4_from12(b['abs'])))} for b in sk]
    prims, textures, meshes_out = [], {}, []
    for mdesc in meshes:
        path = resolve(client_root, mdesc['file'])
        if not path: print('missing mesh', mdesc['file']); continue
        lod = lcmesh.parse(path)['lods'][0]
        n = len(lod['positions']) // 3
        if n < 4 or not lod['surfaces'] or os.path.basename(path).lower().startswith('_tag'): continue
        joints, weights = [], []
        per = [[] for _ in range(n)]
        for wm in lod['weightmaps']:
            bi = index.get(wm['bone'])
            if bi is None: continue
            for v, w in wm['weights']: per[v].append((w, bi))
        for lst in per:
            lst = sorted(lst, reverse=True)[:4] or [(1.0, 0)]
            total = sum(w for w, _ in lst) or 1
            lst += [(0.0, 0)] * (4 - len(lst))
            joints.append([b for _, b in lst]); weights.append([w / total for w, _ in lst])
        for s in lod['surfaces']:
            texname = (s.get('textures') or [None])[0]
            tex_file = mdesc['textures'].get(texname) if texname else None
            png = None
            if tex_file:
                src = resolve(client_root, tex_file)
                if src:
                    png = os.path.join(out_dir, os.path.splitext(os.path.basename(src))[0] + '.png')
                    if png not in textures.values(): lctex.convert(src, png)
                    textures[texname] = png
            prims.append({'name': s['name'], 'mesh': os.path.basename(path), 'indices': [i + s['first'] for i in s['tris']],  # stored relative to the surface
                          'png': png, 'color': s.get('shaderFlags') if s.get('shader', '').endswith('Color.sha') else None})
        # one vertex buffer per mesh file; primitives reference it by mesh name
        meshes_out.append({'name': os.path.basename(path), 'positions': list(lod['positions']), 'normals': list(lod['normals']),
                           'uvs': list(lod['uvmaps'][0]['uvs']), 'joints': joints, 'weights': weights})
    anims = []
    for aspath in animsets:
        p = resolve(client_root, aspath)
        for a in lcska.read_animset(p):
            if include_anims and a['name'] not in include_anims: continue
            chans = []
            for be in a['bones']:
                bi = index.get(be['bone'])
                if bi is None: continue
                if be['pos']: chans.append({'bone': bi, 'path': 'translation', 'times': [f * a['spf'] for f, _ in be['pos']], 'values': [list(v) for _, v in be['pos']]})
                if be['rot']: chans.append({'bone': bi, 'path': 'rotation', 'times': [f * a['spf'] for f, _ in be['rot']], 'values': [quat_xyzw(q) for _, q in be['rot']]})
            anims.append({'name': a['name'], 'duration': (a['frames'] - 1) * a['spf'], 'channels': chans})
    return {'bones': bones, 'meshes': meshes_out, 'primitives': prims, 'animations': anims, 'offset': offset}

if __name__ == '__main__':
    smc, root, out_json = sys.argv[1], sys.argv[2], sys.argv[3]
    only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 else None
    data = build(smc, root, os.path.dirname(out_json), only)
    json.dump(data, open(out_json, 'w'))
    print(f"bones {len(data['bones'])}, meshes {len(data['meshes'])}, primitives {len(data['primitives'])}, animations {len(data['animations'])}: {[a['name'] for a in data['animations']][:12]}")

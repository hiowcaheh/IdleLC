"""Build the private arena demo page (tools/lc/demo/arena.template.html + converted LC assets).

The output embeds LC client assets, so it must never be committed while the repo is public.

Usage (from the repo root):
  python3 tools/lc-db/mysql2sqlite.py <out>/lc.sqlite <dump>/newproject_data.sql
  python3 tools/lc/demo/build_demo.py --client "<client root with Data/>" --db <out>/lc.sqlite --out <out>

Steps: .smc -> JSON (lc2json.py) -> JPEG textures -> GLB (json2glb.mjs) -> meshopt (scripts/convert-models.mjs)
-> data bundle (models, texture variants, monster stats + drops with icons from the database) -> HTML page.
"""
import argparse, base64, importlib.util, io, json, os, sqlite3, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
LC = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(LC))


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(LC, name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


lc2json, lctex = load('lc2json'), load('lctex')

KNIGHT_ANIMS = ['ni_idle_01', 'ni_idle_02', 'ni_run_01', 'ni_walk_01', 'ni_att_01', 'ni_att_02', 'ni_att_03',
                'ni_att_04', 'ni_dam', 'ni_die_01', 'ni_skill_01', 'ni_skill_03', 'ni_sit_01']
# database npc id -> (model key, texture variant)
DEMO_MONSTERS = [(146, 'fox', None), (60, 'fox', None), (145, 'deer', None), (63, 'jaguar', None), (429, 'jaguar', None),
                 (410, 'deer', 'animal01'), (412, 'jaguar', 'animal01'), (415, 'fox', 'animal02'), (423, 'sphinx_ft', None)]
MODEL_SMC = {'fox': 'Data/Monster/Animals/Fox.smc', 'deer': 'Data/Monster/Animals/Deer.smc',
             'jaguar': 'Data/Monster/Animals/Jaguar.smc', 'sphinx_ft': 'Data/Monster/Sphinx/sphinx_ft.smc'}


def to_jpeg(path, size=512):
    out = os.path.splitext(path)[0] + '.jpg'
    image = Image.open(path).convert('RGB')
    image.thumbnail((size, size), Image.LANCZOS)
    image.save(out, quality=82, optimize=True)
    return out


def build_model(key, smc, client, out, anims):
    work = os.path.join(out, key)
    os.makedirs(work, exist_ok=True)
    data = lc2json.build(smc, client, work, set(anims) if anims else None)
    for prim in data['primitives']:
        if prim.get('png'):
            prim['png'] = to_jpeg(prim['png'])  # LC alpha channels are gloss masks; glTF OPAQUE ignores them
    json_path = os.path.join(work, key + '.json')
    json.dump(data, open(json_path, 'w'))
    raw = os.path.join(out, key + '.glb')
    subprocess.run(['node', os.path.join(LC, 'json2glb.mjs'), json_path, raw], check=True, cwd=REPO)
    subprocess.run(['node', os.path.join(REPO, 'scripts', 'convert-models.mjs'), raw, '--out', os.path.join(out, 'opt')],
                   check=True, cwd=REPO)
    return os.path.join(out, 'opt', key + '.glb')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--client', required=True, help='client root that contains Data/')
    ap.add_argument('--db', required=True, help='SQLite file made by tools/lc-db/mysql2sqlite.py')
    ap.add_argument('--out', required=True)
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    os.makedirs(out, exist_ok=True)

    models = {'knight': build_model('knight', os.path.join(HERE, 'knight_armored.smc'), args.client, out, KNIGHT_ANIMS)}
    db = sqlite3.connect(args.db)
    cols = [d[0] for d in db.execute('select * from t_npc limit 0').description]
    rows = {npc: dict(zip(cols, db.execute('select * from t_npc where cast(a_index as int)=?', (npc,)).fetchone()))
            for npc, _, _ in DEMO_MONSTERS}
    for key, smc in MODEL_SMC.items():
        anim_names = {r[f'a_motion_{k}'] for (npc, model, _), r in zip(DEMO_MONSTERS, rows.values()) if model == key
                      for k in ['idle', 'walk', 'run', 'attack', 'dam', 'die']}
        models[key] = build_model(key, os.path.join(args.client, smc), args.client, out, anim_names)

    def jpg_uri(tex):
        png = os.path.join(out, os.path.basename(tex) + '.png')
        lctex.convert(tex, png)
        buf = io.BytesIO()
        image = Image.open(png).convert('RGB')
        image.thumbnail((512, 512))
        image.save(buf, 'JPEG', quality=80, optimize=True)
        return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()

    variants = {v: jpg_uri(lc2json.resolve(args.client, f'Data/Monster/Animals/{v}.tex')) for v in ['animal01', 'animal02']}

    atlases = {}

    def icon(tid, row, col):
        tid = int(tid)
        if tid not in atlases:
            tex = lc2json.resolve(args.client, f'Data/Interface/ItemBtn{tid}.tex')
            atlases[tid] = None
            if tex:
                png = os.path.join(out, f'ItemBtn{tid}.png')
                lctex.convert(tex, png)
                atlases[tid] = Image.open(png).convert('RGBA')
        atlas = atlases[tid]
        if atlas is None:
            return None
        cell = atlas.crop((int(col) * 32, int(row) * 32, int(col) * 32 + 32, int(row) * 32 + 32))
        buf = io.BytesIO()
        cell.save(buf, 'PNG', optimize=True)
        return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()

    monsters = []
    for npc, model, variant in DEMO_MONSTERS:
        r = rows[npc]
        drops = []
        for i in range(20):
            item, pct = str(r[f'a_item_{i}']), r[f'a_item_percent_{i}']
            if item in ('-1', '0', 'None'):
                continue
            it = db.execute('select a_name_usa, a_texture_id, a_texture_row, a_texture_col from t_item where a_index=?',
                            (item,)).fetchone()
            if it and it[0]:
                drops.append({'name': it[0], 'pct': int(pct) / 100, 'icon': icon(it[1], it[2], it[3])})
        drops.sort(key=lambda d: -d['pct'])
        monsters.append({
            'id': npc, 'name': r['a_name_usa'], 'level': int(r['a_level']), 'hp': int(r['a_hp']),
            'attack': int(r['a_attack']), 'defense': int(r['a_defense']), 'exp': int(r['a_exp']),
            'gold': int(r['a_prize']), 'attackSpeed': int(r['a_attackSpeed']), 'scale': float(r['a_scale']),
            'file': r['a_file_smc'], 'model': model, 'variant': variant, 'elite': 'Elite' in r['a_name_usa'],
            'anims': {k: r[f'a_motion_{k}'] for k in ['idle', 'walk', 'run', 'attack', 'dam', 'die']}, 'drops': drops,
        })

    bundle = {'models': {k: base64.b64encode(open(p, 'rb').read()).decode() for k, p in models.items()},
              'variants': variants, 'monsters': monsters}
    template = open(os.path.join(HERE, 'arena.template.html')).read()
    assert '/*__LCDATA__*/' in template
    page = template.replace('/*__LCDATA__*/', 'window.LCDATA = ' + json.dumps(bundle, separators=(',', ':')) + ';')
    target = os.path.join(out, 'idlelc-arena.html')
    open(target, 'w').write(page)
    print(f'wrote {target} ({len(page) / 1024 / 1024:.1f} MB)')


if __name__ == '__main__':
    sys.exit(main())

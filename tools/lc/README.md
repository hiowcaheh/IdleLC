# Konwerter assetów LC (prototyp)

Prototyp w Pythonie + Node, który zamienia pliki klienta LC (Serious Engine SKA, zmodyfikowany przez LC)
na GLB do three.js. Formaty opisane są w [`docs/lc-formats.md`](../../docs/lc-formats.md).
Docelowo zastąpi go `npm run convert-lc` w Node.

**Pliki klienta i wyniki konwersji nie trafiają do repo**, dopóki jest publiczne — trzymaj je w
`assets-src/` (ignorowane przez git).

Wymagania: Python 3 + Pillow, Node 22 i `npm install` w repo (gltf-transform, meshoptimizer).

## Narzędzia

| Plik                 | Co robi                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `lcmesh.py`          | czyta siatkę `.bm` (MESH v17 z szyfrowanymi licznikami)                         |
| `lcska.py`           | czyta szkielet `.bs` i animacje `.ba`                                           |
| `lctex.py`           | `.tex` → PNG (DXT1/DXT5, RGB/RGBA, szyfrowany lub jawny nagłówek)               |
| `lc2json.py`         | składa model z `.smc` (siatki + tekstury + szkielet + wybrane animacje) do JSON |
| `json2glb.mjs`       | JSON → GLB ze skinningiem i animacjami (gltf-transform)                         |
| `view.html`          | podgląd GLB w przeglądarce (przez `npm run dev`)                                |
| `demo/build_demo.py` | buduje prywatną stronę „arena” z modelami, statystykami i dropem z bazy         |
| `../lc-db/*.py`      | zrzut MySQL → SQLite i szybkie zapytania                                        |

## Przykład: jeden model

```bash
# z katalogu repo; CLIENT = folder klienta zawierający Data/
python3 tools/lc/lc2json.py "$CLIENT/Data/Monster/Animals/Fox.smc" "$CLIENT" out/fox/fox.json \
  m_fo,m_fo_walk,m_fo_run,m_fo_att,m_fo_da,m_fo_die
node tools/lc/json2glb.mjs out/fox/fox.json out/fox.glb
npm run convert-models -- out/fox.glb --out public/assets-local/models   # meshopt, dedup, resample
```

Podgląd: `npm run dev`, potem
`http://localhost:5173/IdleLC/tools/lc/view.html?file=/IdleLC/public/assets-local/models/fox.glb` —
albo skopiuj GLB obok `view.html` i podaj samą nazwę pliku.

## Przykład: strona demo (arena)

```bash
python3 tools/lc-db/mysql2sqlite.py out/lc.sqlite <zrzut>/newproject_data.sql
python3 tools/lc/demo/build_demo.py --client "$CLIENT" --db out/lc.sqlite --out out/demo
# wynik: out/demo/idlelc-arena.html (ok. 4 MB, zawiera assety LC — nie commitować)
```

Knight w zbroi z ekranu logowania jest składany z `demo/knight_armored.smc` (części z `Knight/Login/`
na szkielecie `ni.bs` z animacjami `ni.ba`).

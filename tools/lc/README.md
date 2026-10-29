# Konwerter assetów LC — prototyp (Python)

Pierwsza wersja konwertera plików klienta LC (Serious Engine SKA, zmodyfikowany przez LC) do GLB.
**Do gry używaj `npm run convert-lc`** (Node, `scripts/lc/`, opis w głównym README) — daje te same
wyniki (184/184 tekstur identycznych, te same modele i animacje) i od razu odświeża manifest modeli.
Prototyp zostaje jako punkt odniesienia i do budowy strony demo. Formaty:
[`docs/lc-formats.md`](../../docs/lc-formats.md).

| Prototyp (Python)         | Konwerter (Node, `scripts/lc/`)                |
| ------------------------- | ---------------------------------------------- |
| `lcmesh.py`               | `mesh.mjs` (+ `binary.mjs`: klucze XOR)        |
| `lcska.py`                | `ska.mjs`                                      |
| `lctex.py`                | `texture.mjs` (JPEG/PNG przez `sharp`)         |
| `lc2json.py`              | `smc.mjs`, `client.mjs`, `model.mjs`           |
| `json2glb.mjs`            | `model.mjs` + optymalizacja w `convert-lc.mjs` |
| `demo/knight_armored.smc` | `classes.mjs` (modele klas)                    |

**Pliki klienta nie trafiają do repo** — trzymaj je w `assets-src/` (ignorowane przez git). Wyniki
konwersji z prototypu też zostaw lokalnie; modele dla gry robi `npm run convert-lc` (`public/models/lc/`).

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

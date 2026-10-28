# IdleLC

Przeglądarkowe RPG idle/AFK z walką 3D w klimacie klasycznych MMORPG z lat 2007–2010.
Działa na PC i telefonie, bez instalacji.

**Wersja testowa:** https://hiowcaheh.github.io/IdleLC/

## Uruchomienie lokalne

Wymagany Node.js 22+.

```bash
npm install
npm run dev        # http://localhost:5173/IdleLC/
```

Inne komendy:

| Komenda                  | Co robi                                                   |
| ------------------------ | --------------------------------------------------------- |
| `npm run check`          | lint + formatowanie + typecheck + testy (to samo co CI)   |
| `npm test`               | testy Vitest                                              |
| `npm run build`          | build produkcyjny do `dist/`                              |
| `npm run preview`        | podgląd buildu produkcyjnego                              |
| `npm run format`         | formatowanie Prettierem                                   |
| `npm run convert-models` | konwersja modeli z `assets-src/` do zoptymalizowanych GLB |

### Tryb deweloperski

Dopisz `?dev=1` do adresu, np. `http://localhost:5173/IdleLC/?dev=1` albo
`https://hiowcaheh.github.io/IdleLC/?dev=1`. Pojawi się panel z:

- przyspieszeniem czasu (×0,25 … ×10) — walka, animacje i regeneracja,
- linkiem **Model & animation viewer** — każdy model z manifestu i każdy klip z pliku GLB
  (klipy podpięte pod logiczne animacje są oznaczone, np. `Punch attack`).

## Deploy na GitHub Pages

Każdy push na `main` uruchamia workflow `.github/workflows/deploy.yml`:
lint → testy → build → publikacja na GitHub Pages.

**Jednorazowo trzeba włączyć Pages w ustawieniach repozytorium:**

1. GitHub → repozytorium **IdleLC** → **Settings** → **Pages**.
2. W sekcji **Build and deployment** ustaw **Source: GitHub Actions**.
3. Uruchom ponownie workflow (zakładka **Actions** → ostatni run → **Re-run all jobs**) albo zrób nowy push.

Gra będzie dostępna pod `https://<użytkownik>.github.io/IdleLC/`.

## Assety 3D

- W repo są tylko modele na wolnej licencji (CC0) — lista w [`ASSETS-LICENSES.md`](ASSETS-LICENSES.md).
- Modele opisuje manifest `src/game/assets/manifest.json` (ścieżka, skala, mapowanie animacji
  `idle` / `run` / `attack` / `hit` / `die`). Podmiana modelu = zmiana jednego wpisu.
- Własne pliki źródłowe wrzucaj do `assets-src/` (folder jest w `.gitignore`, nie trafia do repo).
  `npm run convert-models` zapisze wynik do `public/assets-local/models/` (też ignorowany).
- Żeby lokalnie używać skonwertowanych modeli, utwórz `.env.local`:

  ```bash
  VITE_ASSET_BASE_URL=/IdleLC/assets-local/models/
  ```

  i podmień ścieżki w manifeście na nazwy swoich plików.

- Pliki FBX/OBJ/DAE wymagają Blendera (na `PATH` albo w zmiennej `BLENDER=/ścieżka/do/blender`).

## Struktura

```
src/
  game/
    logic/      czyste funkcje gry (walka, balans, zapis) — bez Reacta, z testami
    data/       definicje klas, stref, potworów
    assets/     manifest modeli 3D
    service/    GameService (interfejs) + LocalGameService (localStorage)
  state/        store Zustand
  scene/        scena 3D (react-three-fiber)
  ui/           komponenty interfejsu
scripts/        narzędzia (konwersja modeli)
docs/           dokumentacja (balans)
```

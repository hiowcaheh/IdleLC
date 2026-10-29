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

### Postacie i zapis

Konto ma do 4 postaci (6 klas). Wszystko zapisuje się w przeglądarce (`localStorage`, klucz `idlelc.save`):
poziom, exp, złoto, zabicia, ekwipunek i miejsce polowania. Po powrocie gra otwiera się na ostatniej postaci.

**Wyprawy AFK:** przycisk **Expedition** w panelu polowania wysyła postać na polowanie bez ciebie (do 8 h, także
przy zamkniętej grze). **Return now** kończy wyprawę i otwiera okno „While you were away…” z zabiciami, expem,
złotem, awansem i dropem. Drop (1:1 z bazy) trafia do ekwipunku (ikona torby w HUD). Szczegóły w
[`docs/balance.md`](docs/balance.md).
**Settings → Change character** wraca do wyboru postaci, **Reset save** kasuje wszystkie postacie.
Zapisy ze starszej wersji gry są przenoszone automatycznie (postać „Hero”).

### Narzędzia deweloperskie

Włącz w grze: **Settings → Developer tools** (przeglądarka to zapamięta) albo dopisz `?dev=1` do adresu.
Panel (można go zwinąć do małej pigułki „DEV”) ma:

- prędkość gry ×0,5 … ×20 — walka, animacje i regeneracja,
- wybór dowolnego potwora z dowolnej strefy,
- poziom postaci (−10 … +10), +25% expa, +1000 złota (zapisywane jak normalny postęp),
- **AFK 1h / AFK 8h** — wyprawa cofnięta w czasie o 1 h / 8 h i od razu odebrana (okno podsumowania i drop),
- **Kill target** i **Heal**,
- **Model viewer** — każdy model z manifestu i każdy klip z pliku GLB.

## Deploy na GitHub Pages

Każdy push na `main` uruchamia workflow `.github/workflows/deploy.yml`:
lint → testy → build → publikacja na GitHub Pages.

**Jednorazowo trzeba włączyć Pages w ustawieniach repozytorium:**

1. GitHub → repozytorium **IdleLC** → **Settings** → **Pages**.
2. W sekcji **Build and deployment** ustaw **Source: GitHub Actions**.
3. Uruchom ponownie workflow (zakładka **Actions** → ostatni run → **Re-run all jobs**) albo zrób nowy push.

Gra będzie dostępna pod `https://<użytkownik>.github.io/IdleLC/`.

## Assety 3D

- Modele spoza LC są na wolnej licencji (CC0) — lista w [`ASSETS-LICENSES.md`](ASSETS-LICENSES.md);
  modele LC (`public/models/lc/`) opisuje sekcja „Tryb LC” niżej.
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

## Tryb LC (dane i modele z klienta i bazy LC)

Gra działa na danych z bazy LC (`src/game/data/generated/`) i modelach z klienta (`public/models/lc/`) —
oba foldery są w repo (decyzja właściciela), więc tak samo działa na GitHub Pages. Surowe pliki klienta
i zrzut bazy trzymamy poza repo, w `assets-src/`. Żeby odświeżyć dane albo dodać modele:

1. Wygeneruj dane gry z zrzutu bazy:

   ```bash
   npm run import-lc-db -- --dump <folder zrzutu>/newproject_data.sql
   ```

   Powstanie `src/game/data/generated/lc-data.json` (potwory, strefy, drop, przedmioty, exp).

2. Skonwertuj modele z klienta (folder z `Data/`; może być kilka `--client`):

   ```bash
   npm run convert-lc -- --client <folder klienta>
   ```

   Konwerter bierze modele klas (`scripts/lc/classes.mjs`) i wszystkich potworów z `lc-data.json`
   (tylko animacje używane w bazie), zapisuje GLB do `public/models/lc/` (np. `fox.glb`,
   `class-knight.glb`) i odświeża manifest `src/game/data/generated/lc-models.json`. Pojedynczy model:
   `--smc "Data\Monster\Animals\Fox.smc"`, wybrane modele: `--only fox,class-knight`.
   Formaty plików: [`docs/lc-formats.md`](docs/lc-formats.md).

3. `npm run dev` i commit zmienionych plików.

Potwory bez skonwertowanego modelu pokazują tymczasowy model. Narzędzia deweloperskie pozwalają zmienić
strefę, potwora i poziom postaci. `VITE_LC_DATA=0` (np. w `.env.local`; tak działają testy) wyłącza dane LC
i gra wraca do danych zastępczych.

## Struktura

```
src/
  game/
    logic/      czyste funkcje gry (walka, balans, postacie, exp, nagrody, zapis) — bez Reacta, z testami
    data/       definicje klas, stref, potworów, tabela expa (generated/ — dane z bazy LC)
    assets/     manifest modeli 3D
    service/    GameService (interfejs, komendy async) + LocalGameService (localStorage)
    session/    walka na ekranie (CombatSession) — tylko w przeglądarce
  state/        store Zustand
  scene/        scena 3D (react-three-fiber)
  ui/           komponenty interfejsu
scripts/        narzędzia: konwersja modeli, lc/ — import bazy i konwerter klienta LC
docs/           dokumentacja: balans, formaty i baza LC, plan Supabase
```

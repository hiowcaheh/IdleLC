# IdleLC

Przeglądarkowe RPG idle/AFK z walką 3D w klimacie klasycznych MMORPG z lat 2007–2010.
Działa na PC i telefonie, bez instalacji.

**Wersja testowa:** https://hiowcaheh.github.io/IdleLC/

**Jako aplikacja na telefonie:** otwórz stronę i wybierz „Dodaj do ekranu głównego” (Android/Chrome: menu ⋮ →
„Zainstaluj aplikację”; iPhone/Safari: Udostępnij → „Do ekranu początkowego”). Gra otwiera się wtedy na pełnym
ekranie z ikoną IdleLC. Po pierwszej wizycie pliki gry są w pamięci telefonu (service worker `public/sw.js`),
więc start jest szybszy i działa nawet bez internetu; nowa wersja wczytuje się przy następnym otwarciu
z internetem. Ikony aplikacji (własne, bez grafik LC) generuje `npm run pwa-icons`.

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
| `npm run pwa-icons`      | ikony aplikacji (PWA) do `public/pwa/`                    |

### Postacie i zapis

Konto ma do 4 postaci (6 klas). Wszystko zapisuje się w przeglądarce (`localStorage`, klucz `idlelc.save`):
poziom, exp, złoto, SP, umiejętności, zabicia, ekwipunek i miejsce polowania. Po powrocie gra otwiera się na
ostatniej postaci.

**Ekran walki:** nad potworem „Lv N Nazwa” (kolor poziomu = trudność), pod jego paskiem HP ikony klątw,
ogłuszenia i trucizny; nad graczem jego nick. Nagrody za zabicie (drop z ikoną, EXP, SP, złoto) jadą po prawej
stronie z dołu do góry; liczby nad głowami układają się w wiersze, żeby się nie nakładały. Ramka gracza u góry ma portret klasy z klienta. **Mapa świata:**
dotknij nazwy strefy w panelu polowania — 9 stref z typowymi poziomami potworów (od najłatwiejszej); wybór
przenosi polowanie tam (potwór najbliższy poziomem), więc widać inne potwory i ich drop.

**Umiejętności:** wszystkie umiejętności klas 1:1 z bazy (koszty many, czasy, poziomy, wymagania). Potwory dają
punkty umiejętności (SP); w oknie **Skills** (ikona księgi w HUD, zielona liczba = ile można się nauczyć)
uczy się ich i podnosi poziomy. Nauczone umiejętności działają same w walce (pasek nad panelem polowania:
odnowienie, AUTO / OFF po dotknięciu), zużywają manę (niebieski pasek) i działają też na wyprawach.
Umiejętności, których efektów jeszcze nie mamy (przywołania, prędkość ruchu, wskrzeszenie), są szare.
Umiejętność potrzebująca innego sprzętu (np. Shield Strike — tarczy i miecza; podwójne miecze zdejmują tarczę) nie
działa, dopóki go nie założysz — okno Skills pisze, czego brakuje. Na pasku
mieści się 7 umiejętności (ataki z lewej, buffy z prawej) i tylko one są używane w walce — w oknie Skills „Add to
bar” / „Remove from bar”.

**Ekwipunek:** postać zaczyna w darmowym zestawie swojej klasy z bazy. **Shop** (panel polowania) sprzedaje
broń i zbroje twojej klasy z progu poprzedniego, obecnego i następnego oraz towary (mikstury, kamienie, lupy;
ceny 1:1). Akcesoria (z losowymi opcjami z bazy, 1–5 na sztukę; trzy sloty) wypadają z potworów. Sprzęt zakłada się z torby (podgląd zmiany ataku
i obrony), a w oknie **Character** (ikona hełmu) widać statystyki i sloty, można zdjąć sprzęt i ulepszać go
+0…+15 Heaven Stone'ami (sklep; 10 Smelting Stone z dropu wymienia się w torbie na 1 Heaven Stone; porażka
od +3 zabiera jeden „+”). Lepszy
sprzęt = szybsze polowanie, także na wyprawach. „Sell all loot” w torbie zostawia sprzęt twojej klasy.

**Rzadkie przedmioty:** od ok. 70 poz. bronie i zbroje spadają nieodkryte (czerwona nazwa; można je nosić
bez opcji). **Appraiser** (panel polowania) odkrywa je lupami ze sklepu (złota 1 000 000 — zawsze, zwykła
600 000 — 60%): zestaw z bazy daje prefiks nazwy, klasę (kolor: E biały, D żółty, C jasnoniebieski, B zielony,
A niebieski), premie i opcje. Odkryte są posortowane od najlepszych; „E ×5” zaznacza klasę, „Sell selected”
sprzedaje. Zwykły sprzęt dostaje opcje z gry: co 10 minut aktywnej walki jedna opcja na losową założoną część
(karta postaci → Stats pokazuje, kiedy następna).

**Mikstury:** w sklepie Juno (dane 1:1: leczenie i mana przez 15 s, regeneracja przez 10 min). Gracz wkłada
miksturę do slotu HP i slotu MP (pod przyciskami menu po prawej; dotknięcie slotu otwiera wybór z torby, przełącznik AUTO
i opróżnianie). Postać pije sama tylko te dwie — w walce i na wyprawach (leczenie poniżej 50% HP, mana poniżej
30% MP, regeneracja, gdy brakuje HP / MP); slot pokazuje, ile zostało, a „A” — że AUTO jest włączone.
Działająca mikstura jest wśród efektów pod paskami, a zużyte na wyprawie — w podsumowaniu.

**Wyprawy AFK:** przycisk **Expedition** w panelu polowania wysyła postać na polowanie bez ciebie (do 8 h, także
przy zamkniętej grze). **Return now** kończy wyprawę i otwiera okno „While you were away…” z zabiciami, expem,
złotem, awansem i dropem. Drop (1:1 z bazy) trafia do ekwipunku (ikona torby w HUD): siatka slotów z zakładkami
typów (All, Weapons, Armor, Jewelry, Potions, Other), każda broń i zbroja w osobnym slocie; dotknięcie przedmiotu
otwiera okienko z informacją i akcjami. Przedmioty sprzedaje się za cenę z bazy × stawkę skupu sklepu (40%). Szczegóły w
[`docs/balance.md`](docs/balance.md).
**Settings → Change character** wraca do wyboru postaci, **Reset save** kasuje wszystkie postacie.
Zapisy ze starszej wersji gry są przenoszone automatycznie (postać „Hero”; od wersji 5 postacie dostają
darmowe umiejętności startowe i 0 SP, od wersji 6 — darmowy zestaw startowy sprzętu, od wersji 7 — pasek 7
umiejętności, od wersji 8 — rzadkie przedmioty i licznik opcji z gry).

### Narzędzia deweloperskie

Włącz w grze: **Settings → Developer tools** (przeglądarka to zapamięta) albo dopisz `?dev=1` do adresu.
Panel (można go zwinąć do małej pigułki „DEV”) ma:

- prędkość gry ×0,5 … ×20 — walka, animacje i regeneracja,
- wybór dowolnego potwora z dowolnej strefy,
- poziom postaci (−10 … +10), +25% expa, +1000 złota, +10 SP (zapisywane jak normalny postęp),
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

   Powstanie `src/game/data/generated/lc-data.json` (potwory, strefy, drop, przedmioty, exp)
   i `lc-item-models.json` (model każdej broni i zbroi — dla konwertera).

2. Skonwertuj modele z klienta (folder z `Data/`; może być kilka `--client`):

   ```bash
   npm run convert-lc -- --client <folder klienta>
   ```

   Konwerter bierze ciała klas (`scripts/lc/classes.mjs`: twarz, włosy, koszula, spodnie, dłonie, stopy
   nowej postaci) i wszystkie potwory z `lc-data.json` (tylko animacje używane w bazie), zapisuje GLB do
   `public/models/lc/` (np. `fox.glb`, `class-knight.glb`) i odświeża manifest
   `src/game/data/generated/lc-models.json`. Konwertuje też modele broni i zbroi
   (`lc-item-models.json` z importu → `public/models/lc/gear/`, manifest `lc-gear.json`): gra zakłada je
   na ciało klasy i chowa części, które zastępują (koszula pod zbroją, włosy pod hełmem). Same zestawy
   startowe: `--only starter`, cały sprzęt: `--only gear`. Wycina też ikony przedmiotów z atlasów
   `ItemBtn*.tex` do `public/icons/lc/items.webp` (same ikony: `--only icons`). Pojedynczy model:
   `--smc "Data\Monster\Animals\Fox.smc"`, wybrane modele: `--only fox,class-knight,gear/ni_bu_001`.
   Animacje umiejętności czyta z `Data\skills.lod` (`lc-skill-anims.json`, klipy trafiają do modeli klas),
   tekstury efektów skilli z `Data\Effect` → `public/fx/` (same efekty: `--only fx`).
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

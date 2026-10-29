# IdleLC — wytyczne projektu

## Cel projektu

Budujemy **IdleLC** — przeglądarkowe RPG typu IDLE / AFK z walką 3D, w klimacie klasycznego MMORPG z lat 2007–2010. Gracz tworzy postać, wybiera lokację i potwory, walczy aktywnie (auto-walka z animacjami 3D) albo wysyła postać na wyprawę AFK i wraca po expa i łupy. Gra ma działać na PC i telefonie, bez instalacji.

## Etap 1 (TERAZ): tylko frontend, bez backendu

- **Nie używamy teraz Supabase ani żadnego serwera.** Skupiamy się na frontendzie, scenie 3D, animacjach, UI i mechanice gry.
- Cała gra działa w przeglądarce, a stan gry zapisuje się lokalnie (`localStorage`).
- Hosting do testów: **GitHub Pages** — `https://hiowcaheh.github.io/IdleLC/`.
- Backend (Supabase) dodamy w etapie 2 — kod ma być od początku przygotowany tak, żeby dało się go podpiąć bez przepisywania gry (patrz „Warstwa danych”).

## Stack (nie zmieniaj bez pytania)

- **Frontend:** Vite + React + TypeScript
- **3D:** Three.js przez `@react-three/fiber` + `@react-three/drei`; modele w formacie **glTF/GLB** (kompresja meshopt lub Draco)
- **UI:** komponenty React + CSS (ciemny, „fantasy” styl, mobile-first)
- **Stan gry:** prosty store (Zustand) + zapis do `localStorage`
- **Testy:** Vitest dla logiki i formuł
- **Hosting:** GitHub Pages, deploy przez GitHub Actions przy każdym pushu na `main`
- `base: '/IdleLC/'` w `vite.config.ts`, routing przez `HashRouter` (GitHub Pages nie obsługuje SPA routingu)

## Warstwa danych (przygotowanie pod backend)

1. Cała logika gry (walka, exp, poziomy, łupy, AFK) w osobnym folderze `src/game/logic/` jako **czyste funkcje TypeScript** bez Reacta — łatwe do testowania i później do przeniesienia na serwer.
2. UI rozmawia z grą tylko przez interfejs `GameService` (np. `createCharacter`, `combatTick`, `startAfk`, `claimAfk`, `equipItem`, `upgradeItem`).
3. Teraz istnieje jedna implementacja: `LocalGameService` (liczy lokalnie, zapisuje do `localStorage`). W etapie 2 dodamy `SupabaseGameService` z tym samym interfejsem.
4. Zapis w `localStorage` z numerem wersji (`saveVersion`) i migracją starych zapisów, żeby aktualizacje nie kasowały postępu testerów. Przycisk „Reset zapisu” w ustawieniach.
5. **AFK lokalnie:** przy starcie wyprawy zapisz czas startu. Przy powrocie licz `min(teraz - start, 8h)`, symuluj walkę statystycznie (zabicia/h na podstawie statystyk postaci vs potwora) i wypłać nagrody. Ekran „Gdy cię nie było…” z podsumowaniem.
6. Tryb deweloperski (`?dev=1`): przyspieszenie czasu, dodanie expa/złota, podgląd animacji każdego modelu — do szybkiego testowania.

## Assety — WAŻNE

- Repo jest **na razie publiczne**; właściciel przełączy je na prywatne (GitHub Pro — strona na Pages nadal będzie publiczna).
- **Decyzja właściciela (2026-10-29): skonwertowane modele LC (`public/models/lc/`) i dane wygenerowane z bazy LC (`src/game/data/generated/`) commitujemy mimo publicznego repo**, żeby GitHub Pages pokazywało postęp (właściciel testuje na telefonie). Surowe pliki klienta i zrzut bazy nie trafiają do repo — leżą w `assets-src/` (w `.gitignore`). `public/assets-local/` (też w `.gitignore`) służy do lokalnych eksperymentów.
- Assety spoza LC — tylko z wolną licencją (CC0), wpisane do `ASSETS-LICENSES.md`.
- `npm run convert-models` (gltf-transform; FBX/OBJ/DAE przez Blendera w trybie headless) konwertuje modele z `assets-src/` do zoptymalizowanych GLB.
- **Assety wymienne przez manifest:** każdy potwór/postać ma wpis w `src/game/assets/manifest.json`: `id`, ścieżka do modelu, skala, mapa nazw animacji (`idle`, `run`, `attack`, `hit`, `die`). Podmiana modelu = zmiana jednego wpisu, bez ruszania kodu gry.
- Assety spoza repo mogą być ładowane z konfigurowalnego `VITE_ASSET_BASE_URL`. Domyślnie gra działa na assetach CC0 z repo.
- Nie używaj nazwy „Last Chaos”, logotypów ani oryginalnych grafik w nazwie, UI ani materiałach promocyjnych. Nazwa gry: IdleLC.
- **Dane gry mają być 1:1 z bazy danych LC** dostarczonej przez właściciela (klasy, potwory, przedmioty, drop, exp, strefy, umiejętności, nazwy) — decyzja właściciela. Brakujące w zrzucie elementy (statystyki startowe klas, poziomy umiejętności `t_skillLevel`, wzory obrażeń, szanse ulepszeń) uzupełniamy z kodu serwera, jeśli właściciel go dostarczy, inaczej proponujemy własne i oznaczamy jako własne.

## Dane gry (na razie pliki TS w repo)

Definicje w `src/game/data/` — w etapie 2 przeniesiemy je do bazy:

- `classes` (Titan, Knight, Healer, Mage — statystyki bazowe i przyrost na poziom)
- `zones` (mapy/lokacje, wymagany poziom)
- `monsters` (lokacja, poziom, HP, atak, obrona, exp, złoto, model_id)
- `items` (typ, slot, statystyki, wymagany poziom, rzadkość)
- `lootTables` (potwór → przedmiot, szansa)

Formuły balansu w jednym module `src/game/logic/balance.ts`, opisane w `docs/balance.md`. Max poziom na start: 99.

## Kamienie milowe (po kolei, każdy kończy się działającym deployem na GitHub Pages)

- **M0 — Szkielet:** Vite+React+TS, ESLint/Prettier, Vitest, GitHub Actions → GitHub Pages, README.
- **M1 — Scena 3D:** jedna lokacja (teren, światło, mgła), postać gracza i potwór z CC0, auto-walka z animacjami (idle → bieg → atak → trafienie → śmierć → respawn), paski HP, wyskakujące liczby obrażeń. Płynnie na telefonie.
- **M2 — Postać:** ekran tworzenia postaci z wyborem klasy i podglądem modelu 3D, zapis lokalny.
- **M3 — Progres:** exp, poziomy, złoto, łupy z loot tables, HUD (pasek expa, poziom, złoto). Testy formuł.
- **M4 — AFK:** wyprawy do 8h, ekran podsumowania po powrocie.
- **M5 — Ekwipunek:** sloty, zakładanie przedmiotów, wpływ na statystyki i wygląd, ulepszanie +0…+15 z szansą niepowodzenia.
- **M6 — Świat:** kilka lokacji z wymaganym poziomem, mapa świata do wyboru.
- **Etap 2 (później, nie zaczynaj bez zgody):** Supabase — konta, zapis w chmurze, logika nagród po stronie serwera, ranking, targ.

## Sposób pracy

- Przed każdym kamieniem milowym pokaż krótki plan i poczekaj na akceptację.
- Małe, opisane commity. **Każdy działający krok od razu pushuj na `main`** (każdy push = deploy na Pages), żeby właściciel mógł w ciągu dnia sprawdzać efekty na telefonie. Po każdym kamieniu: lista zmian, link do wersji na GitHub Pages i co sprawdzić ręcznie.
- Jeśli coś jest niejasne (balans, wygląd, nazewnictwo) — zapytaj, nie zgaduj.
- Pisz po polsku w rozmowie; kod, nazwy zmiennych i komentarze po angielsku.
- **Gra jest po angielsku**: cały tekst w UI oraz nazwy klas, potworów, lokacji i przedmiotów. Dokumentacja dla właściciela (README, `docs/`) może być po polsku.

## Komendy

- `npm run dev` — serwer deweloperski (`http://localhost:5173/IdleLC/`)
- `npm run check` — lint + format + typecheck + testy (to samo co CI)
- `npm run build` — build produkcyjny do `dist/`
- `npm run convert-models` — konwersja modeli z `assets-src/`
- `npm run import-lc-db -- --dump <newproject_data.sql>` — dane gry z bazy LC → `src/game/data/generated/`
- `npm run convert-lc -- --client <folder klienta>` — modele LC → `public/models/lc/` + manifest

## Stan prac (aktualizuj na koniec każdej sesji)

**Stan na 2026-10-29 (po południu):**

- M0 i M1 gotowe. Gra na Pages (https://hiowcaheh.github.io/IdleLC/) działa na danych i modelach LC
  (Knight w zbroi + 13 potworów; reszta potworów na modelu zastępczym). UI po angielsku.
- **M1.5 „tor LC → gra”:** `npm run import-lc-db` (dane 1:1 z bazy: 279 potworów w 9 strefach, drop,
  1440 przedmiotów, exp) i `npm run convert-lc` (Node, `scripts/lc/`; modele klas z `classes.mjs`
  i potworów z bazy). Opis w README („Tryb LC”), formaty w `docs/lc-formats.md`, baza w `docs/lc-database.md`.
- **M2 gotowe** (+ część M3): konto z 4 slotami postaci w `localStorage`, ekran wyboru i tworzenia postaci
  (6 klas, podgląd 3D, zasady imion), migracja starych zapisów (postać „Hero”). Zapisywany progres: poziom
  i exp z `t_exp` 1:1, złoto i exp za potwory 1:1 (`a_exp`, `a_prize`), zabicia, miejsce polowania.
  Widoczny awans: pasek EXP na dole (x / y, %), baner i efekt „LEVEL UP”.
- **Drop i ekwipunek:** drop 1:1 z tabel `t_npc` (każdy wpis losowany osobno), ekwipunek jako stosy (zapis v3).
- **M4 (AFK) w dużej części:** czas poza grą (do 8 h) liczony z prawdziwej symulacji walki, okno
  „While you were away…”; dev: AFK 1h/8h. Brakuje jeszcze jawnego wysyłania na wyprawę (jeśli właściciel chce).
- **Przygotowanie pod Supabase:** `GameService` jest asynchroniczny i oparty na komendach
  (`createCharacter`, `travel`, `reportCombat`…); walka na ekranie to `CombatSession` w przeglądarce,
  a nagrody liczy serwis z wyniku walki (limit zabić wg czasu). Plan tabel, RLS i funkcji: `docs/supabase.md`.
- Narzędzia dev włączane w Settings (bez `?dev=1`): prędkość ×20, dowolny potwór, poziom, exp, złoto,
  kill/heal, podgląd modeli.
- Statystyki klas i wzory walki są **własne, tymczasowe** (`classes.ts`, `lcBalance.ts`) — czekają na kod
  serwera LC od właściciela.

**Cel końcowy (właściciel):** cała gra w **prywatnym repo**, hostowana tak, żeby dało się grać na telefonie
i komputerze w dowolnej chwili; na końcu **Supabase** (konta, logowanie, zapis w chmurze, logika po stronie
serwera). Najpierw robimy wszystko, co się da na froncie.

**Decyzje właściciela:** 6 klas na start (Titan, Knight, Healer, Mage, Rogue, Sorcerer); tempo exp jak w LC
(będą bonusy); dane 1:1 z bazy; repo przejdzie na prywatne (GitHub Pro); od 2026-10-29 skonwertowane modele
i dane LC są w repo i na Pages (surowy klient i zrzut bazy — nie).

**Następne kroki:**

1. Właściciel udostępni **pełny klient i kod serwera LC**. Z klienta: `npm run convert-lc -- --client <folder>`
   na całości (wszystkie potwory, 5 pozostałych klas w `scripts/lc/classes.mjs`, ikony przedmiotów, mapy;
   konwerter wypisuje nowe shadery do sprawdzenia). Z kodu serwera: statystyki klas i przyrost na poziom,
   wzory obrażeń/trafień, kary exp za różnicę poziomów, szanse ulepszeń, poziomy umiejętności.
2. Dalej: M5 (sloty sprzętu, zakładanie, wpływ na statystyki, ulepszanie +0…+15), sprzedaż przedmiotów,
   ikony przedmiotów z atlasów `ItemBtn*.tex`, M6 (mapa świata, wymagany poziom stref).
3. Etap 2 (Supabase) według `docs/supabase.md` — dopiero po zgodzie właściciela.

**Otwarte kwestie:** brak siatek broni z `Data\Item\Weapon` (przyszły tylko tekstury i tagi); brak mapy
z otwartym terenem (`.wld` + `.wtr`); brak w bazie statystyk startowych klas, poziomów umiejętności
(`t_skillLevel` pusta) i wzorów walki — źródło: kod serwera, jeśli właściciel ma.

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
- Nie używaj nazwy „Last Chaos” ani logotypów w nazwie, UI ani materiałach promocyjnych. Nazwa gry: IdleLC.
  **Decyzja właściciela (2026-10-29):** grafiki interfejsu z klienta (ramki okien, przyciski, sloty, ramka
  gracza, ikony, portrety) wolno używać w UI gry — `npm run convert-lc -- --client <klient 2015> --only ui`
  tnie je do `public/ui/lc/` (interfejs klienta Nemesis jest zaszyfrowany).
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
- `npm run pwa-icons` — ikony aplikacji (PWA) do `public/pwa/`
- `npm run import-lc-db -- --dump <newproject_data.sql>` — dane gry z bazy LC → `src/game/data/generated/`
- `npm run convert-lc -- --client <folder klienta>` — modele LC → `public/models/lc/` + manifest, ikony
  przedmiotów → `public/icons/lc/items.webp` (same ikony: `--only icons`), teren map → `public/maps/`
  (`--only terrain`)

## Stan prac (aktualizuj na koniec każdej sesji)

**Stan na 2026-10-30 (sesja 2, koniec dnia):**

- M0 i M1 gotowe. Gra na Pages (https://hiowcaheh.github.io/IdleLC/) działa na danych i modelach LC
  (6 klas: ciało nowej postaci + założony sprzęt; wszystkie potwory Juno oprócz Elder Drake — jego `.smc` wskazuje
  brakujący folder `Data\Monster\Wyvern`; potwory innych stref na razie na modelu zastępczym). UI po angielsku.
- **Pełny klient** leży lokalnie w `assets-src/client-full/LastChaos Nemesis/` (8 GB, poza repo; pobrany
  z Google Drive właściciela). Spis: modele wszystkich 212 potworów z bazy, foldery wszystkich klas, 53 mapy
  (`.wld`/`.wtr`, m.in. `juno`), `ItemBtn19.tex`; brak kodu serwera. `ro.ba` i `so.ba` są zaszyfrowane
  (wersja 254) — Rogue bierze klipy z `ro_ep1.ba`, Sorcerer z `Monster/Undead/Sorcerer3/so.ba` (ten sam
  szkielet). Właściciel chce przerabiać klienta **stopniowo, krokami** (oszczędzanie limitu).
- **M1.5 „tor LC → gra”:** `npm run import-lc-db` (dane 1:1 z bazy: 279 potworów w 9 strefach, drop,
  1440 przedmiotów, exp) i `npm run convert-lc` (Node, `scripts/lc/`; modele klas z `classes.mjs`
  i potworów z bazy). Opis w README („Tryb LC”), formaty w `docs/lc-formats.md`, baza w `docs/lc-database.md`.
- **M2 gotowe** (+ część M3): konto z 4 slotami postaci w `localStorage`, ekran wyboru i tworzenia postaci
  (6 klas, podgląd 3D, zasady imion), migracja starych zapisów (postać „Hero”). Zapisywany progres: poziom
  i exp z `t_exp` 1:1, złoto i exp za potwory 1:1 (`a_exp`, `a_prize`), zabicia, miejsce polowania.
  Widoczny awans: pasek EXP na dole (x / y, %), baner i efekt „LEVEL UP”.
- **Drop i ekwipunek:** drop 1:1 z tabel `t_npc` (każdy wpis losowany osobno), ekwipunek jako stosy (zapis v3),
  ikony przedmiotów z atlasów `ItemBtn*.tex` (brak tylko `ItemBtn19`), sprzedaż w sklepie: `a_price × 40%`
  (`t_shop.a_sell_rate`), komenda `sellItems`.
- **M4 (AFK) gotowe:** wyprawy (przycisk „Expedition”, `startAfk`/`claimAfk`, zapis v4) do 8 h; nagrody
  z prawdziwej symulacji walki, okno „While you were away…”; dev: AFK 1h/8h. Bez wyprawy czas poza grą
  nie daje nagród (decyzja właściciela: „wyślij na wyprawę”).
- **Przygotowanie pod Supabase:** `GameService` jest asynchroniczny i oparty na komendach
  (`createCharacter`, `travel`, `reportCombat`…); walka na ekranie to `CombatSession` w przeglądarce,
  a nagrody liczy serwis z wyniku walki (limit zabić wg czasu). Plan tabel, RLS i funkcji: `docs/supabase.md`.
- **Umiejętności (pełne):** 107 umiejętności 6 klas 1:1 z `t_skill`/`t_skilllevel`/`t_magic(level)`, ikony
  `SkillBtn*.tex` → `public/icons/lc/skills.webp`. SP z zabić (`a_skill_point`, 1/10 000), nauka za SP
  (`learnSkill`), AUTO (`setSkillAuto`), zapis v5. Walka: mana i regeneracja, rzucanie, cooldowny, buffy,
  klątwy, ogłuszenie, trucizna, leczenie, pasywne w statystykach; ta sama logika w wyprawach AFK. UI: pasek MP,
  pasek skilli, buffy, okno Skills. Interpretacja efektów `t_magic` i mnożnik obrażeń są **własne**
  (`skills.ts`, opis w `docs/balance.md`); przywołania, ruch i wskrzeszenie jeszcze nie działają.
- **M5 (ekwipunek):** sloty, klasy, poziomy i statystyki 1:1 z `t_item`, szybkość
  ataku z broni (`a_num_2`), darmowy zestaw startowy klasy, sklepy stref 1:1 (`t_shopitem`, kupno ×100%),
  zakładanie z torby z porównaniem, okno Character, ulepszanie +0…+15 tylko Heaven Stone (sklep Juno;
  10 Smelting Stone z dropu 1% — własne — wymienia się na 1 Heaven Stone), zapis v6. Wpływ sprzętu na walkę, szanse ulepszeń i bonus
  za „+” są **własne** (`equipment.ts`, `docs/balance.md`): sprzęt mierzony względem typowego dla poziomu
  (`gearReference` z importu).
- **Wygląd sprzętu na postaci (krok 4):** modele klas = ciało nowej postaci z `Data\Character\<klasa>\xx.smc`;
  każda broń/zbroja ma GLB z `t_item.a_file_smc` (`public/models/lc/gear/`, `lc-gear.json`, WebP, tylko
  używane kości), a `Character.tsx` podpina siatki pod szkielet ciała i chowa zastąpione części (zbroja `bu`,
  spodnie `bd`/`bs`, rękawice `hn`, buty `ft`, hełm `hair`). Ekran tworzenia pokazuje zestaw startowy.
  1127/1146 modeli; 258 z nich (głównie 60–109 poz.) ma w Nemesis zaszyfrowane tekstury — kształt prawdziwy,
  kolor z ikony przedmiotu; 19 przedmiotów z zaszyfrowaną siatką pokazuje najbliższy niższy model (jawne tekstury
  są w kliencie 2015).
- **Wymagany sprzęt skilli:** 1:1 z `t_skill` (`a_useWeaponType0/1`, bity `a_useState` 2 = broń, 16 = tarcza;
  pasywne `a_app*`); skill bez sprzętu nie działa (szary na pasku). Podwójne miecze zdejmują tarczę (reguła
  właściciela).
- **Akcesoria i opcje (zapis v7):** 3 sloty akcesoriów, opcje 1:1 z `t_option` (maski podtypów, wagi
  poziomów `a_prob`, wartości `a_level`); liczba opcji 1–5 i ich działanie w walce są **własne**
  (`options.ts`). Sklep (zakładki Weapons / Armors / Goods): broń i zbroje klasy z progu poprzedniego /
  obecnego / następnego (`shopGear`, bez eventowego Phoenix), towary strefy. Akcesoria z opcjami **wypadają
  z potworów** (0,5% na zabicie — własne, `loot.ts`), sklep ich nie sprzedaje. Pasek umiejętności: zawsze
  7 slotów, ataki od lewej, buffy od prawej.
- **Mikstury:** dane 1:1 (mikstura = skill: HP/MP na sekundę lub regeneracja, czas, odnowienie), sklep Juno.
  Auto-picie w walce i na wyprawach (progi 50% HP / 30% MP — **własne**) tylko mikstur ze slotów HP/MP,
  które gracz wybiera z torby (zapis v9, `potions.ts`, `setPotionSlot`; slot ma przełącznik AUTO), zużycie zgłaszane w `reportCombat` (`potions`) i liczone w `simulateAfk`.
  Stany `t_magic` 2/9 i 2/10 = HP/MP na sekundę także w skillach (Mana Recovery).
- **Karta postaci**: nagłówek (`HeroCard.tsx`) z podglądem 3D postaci w założonym sprzęcie (obrót, animacja
  idle), nick, klasa, poziom, pasek EXP z liczbami, SP, złoto; grafika podglądu z ItemShopu klienta
  (`Cashshop.tex`, `CostumeInventory.tex`) jest w Nemesis zaszyfrowana. Zakładki Stats (wszystkie statystyki zawsze widoczne, regeneracja z buffami i miksturami,
  premie EXP/SP/Gold/Drop — `rewardBonuses`, na razie 0) i Equipment; „+N” za nazwą.
- **Okno przedmiotu** (`ItemInfo.tsx`): karta jak tooltip klienta — rodzaj, ocena, atak, szybkość, wymagany
  poziom, klasa (niespełnione na czerwono), opcje jedna pod drugą; brak „Wear” dla sprzętu innej klasy.
  Komunikaty okien (sprzedaż, zakładanie, ulepszanie, nauka) jako wysuwane toasty (`state/toasts.ts`).
  Inventory: picie mikstur z torby (`drinkPotion`, te same zasady odnowienia), sprzęt od najwyższego poziomu,
  „No items of this type”, okno potwierdzenia „Sell all loot”. Heaven Stone w ulepszaniu jako ikona z liczbą.
- **Drop bez sprzętu Night Shadow** (nikt z 6 klas go nie nosi; decyzja właściciela).
- **Rzadkie przedmioty (zapis v8):** `t_rareoption` 1:1 (klasy A–E, prefiksy, premie, opcje z szansami),
  nieodkryte (czerwone, można nosić), Appraiser z lupami (złota 1 000 000 zawsze, zwykła 600 000 — 60% własne),
  kolory klas wg właściciela (A niebieski, B zielony, C jasnoniebieski, D żółty, E biały), masowa sprzedaż.
  Opcje specjalne (cooldown, mana, kradzież HP/MP, Move Speed itd.) — działanie własne (`options.ts`, `combat.ts`).
  Zwykły sprzęt nie spada z opcjami: co 10 min aktywnej gry opcja na losową założoną część (decyzja właściciela).
- **Ekran walki i świat:** napisy w scenie („Lv N Nazwa” nad potworem, nick nad graczem, klątwy pod paskiem
  potwora; górna ramka celu usunięta), portrety klas z `TopUI.tex` (`npm run convert-lc -- --only icons`),
  mapa świata (9 stref, bez blokady poziomu — prośba właściciela), powrót z wyprawy nie leczy (HP/MP sprzed
  wyprawy + regeneracja za czas nieobecności).
- **UI z klienta:** ramka gracza z `TopUI` przypięta w lewym górnym rogu (paski HP/MP/EXP to grafiki klienta,
  EXP szary), buffy pod nią; okna z tytułem we wgłębieniu ramki i X na narożniku (`Sheet.tsx`); ikony menu
  (System, Inventory, Skills, Character; ×4 z wyostrzeniem), licznik na przycisku na okrągłym przycisku
  klienta (`badge`), złoto tylko w oknach. Strona bez zoomu i zaznaczania (`lockZoom.ts`). Okno Inventory = siatka
  slotów torby + szczegóły wybranego; Character: Stats w polach wartości z `NewCharacterInfo`, Equipment na planszy
  sylwetki klasy z `NewInventory` (`equip-<klasa>.webp`, ramki slotów zmierzone w `CharacterPanel.tsx`). Sloty
  mikstur na lewej krawędzi ekranu; dolny pasek EXP usunięty (jest w ramce); nick nad postacią biały. Czcionka klienta to
  tylko bitmapy 7–8 px (`FontGerman0.tex`, DXT; w Nemesis zaszyfrowane) — czekamy na decyzję właściciela.
- Skille trafiają po `a_readyTime` + 0,4 s (`a_fireTime` to animacja po wystrzale — bez blokady:
  `TIMINGS.skillAnimationLock = 0`).
- **Animacje i efekty skilli:** klipy z `Data\skills.lod` (66 skilli, `lc-skill-anims.json`; czary w 3 fazach:
  przygotowanie → trzymanie → wystrzał) dołożone do modeli klas i dopasowane do rytmu walki
  (`Character.skill`); brak klipu = zwykły zamach. Efekty (`SkillEffects.tsx`) z tekstur klienta
  (`public/fx/`, `--only fx`) według rodzaju skilla, w kolorze klasy: krąg magii przy rzucaniu, pocisk klas
  dystansowych, wybuch/iskry/fala przy trafieniu, klątwa, aura buffa, krąg leczenia; awans: złoty słup,
  krąg, fala i spirala gwiazd. Dokładne efekty LC (`Effect.dat`) są w Nemesis zaszyfrowane.
- **Grafika:** Auto / Low / High / **Ultra** (pełna rozdzielczość ekranu do ×3, miękkie cienie `SoftShadows`
  z drei, cień 2048, anizotropia tekstur, drobinki światła `Sparkles`) — bez nowych zależności.
- Narzędzia dev włączane w Settings (bez `?dev=1`): prędkość ×20, dowolny potwór, poziom, exp, złoto, SP,
  kill/heal, podgląd modeli.
- **PWA:** `public/manifest.webmanifest`, własne ikony (`npm run pwa-icons`), service worker `public/sw.js`
  (strona: najpierw sieć; `/assets/`: cache; modele/ikony/czcionki: cache + odświeżanie w tle; offline działa
  po pierwszej wizycie). Paczka JS podzielona (`three`, `react-three`, `vendor`, `lc-data`, kod gry ~120 KB).
  Brak modelu nie wywraca gry (`ModelBoundary` → zastępcza figura).
- Statystyki klas i wzory walki są **własne, tymczasowe** (`classes.ts`, `lcBalance.ts`) — czekają na kod
  serwera LC od właściciela.
- **Spoty (zapis v10):** każda strefa zaczyna się od pierwszego spotu (kolejność: poziom, zwykłe przed elitami,
  słabsze przed silniejszymi — `zones.ts`); zabicie potwora najdalszego otwartego spotu otwiera następny
  (`logic/spots.ts`, `reachedSpots`). Panel polowania: spot między strzałkami ‹ › (kłódka na zamkniętym),
  mapa świata przenosi na najdalszy otwarty spot strefy. Ukryte: potwory eventowe (Triangle ball, Pumpkin,
  Giant Pumpkin Head) i **bossy rajdowe** (`RAID_BOSSES`: Grand Balrog, Baal — w bazie nie ma „Kamiry”, Grand
  Red/Golden Dragon, Gatekeeper Abaddon, Shadow Dragons, Brainwashed Balrog) — **zapytać właściciela o jego
  pomysł na walki z bossami** (prosił, żeby przypomnieć). Dev: wybór potwora otwiera wszystkie spoty.
- **Księga potworów** (przycisk Book): zabicia każdego potwora wg strefy (`stats.monsterKills`), podgląd 3D;
  nagrody za progi — później (właściciel). Statystyki: wyprawy i czas aktywnej gry (`stats.expeditions`,
  `stats.playSeconds`, liczone w `reportCombat` / `claimAfk`).
- **Appraiser:** zakładki Unidentified / Identified, gracz zaznacza przedmioty do odkrycia (All), pasek
  z ocenami i przyciskiem sprzedaży przyklejony u góry, opcje jedna pod drugą w kolorze oceny.
  **Kupowanie ilości:** okno `BuyDialog` (wpisz / suwak / 1·10·100·Max, do 999 i tyle, ile starczy złota).
  **Heaven Stone w każdym sklepie za 1 000** — tymczasowe na prośbę właściciela (`EVERYWHERE` w `shop.ts`).
- **Potwory Dratan, Merac, Egeha:** 44 modele z klienta; Cursed Lich/Weaver z wersji „2” modelu (`MONSTER_SMC_STANDINS`),
  zaszyfrowane części siatek są pomijane (miecz Weavera).
- **Teren Juno z klienta:** `--only terrain` czyta `.wtr` (opis w `docs/lc-formats.md`) → `public/maps/juno/`;
  scena rysuje 300 m terenu wokół walki z 9 warstwami tekstur w shaderze (`LcTerrain.tsx`, `lcMap.ts`).
  Spawny Juno z `t_npc_regen` nie pasują do żadnego terenu klienta (Dratan pasuje 1:1), więc miejsca walk
  na Juno wybiera konwerter (`pickArenas`) — **własne**. Drzewa/budynki z `.wld` jeszcze nie czytane.
- **Hełm „B6 Cast” 77 dla Knighta:** w bazie Reidon Helm (Cursed Lich) ma tylko oceny E/D/C bez castingu;
  ocenę B (Impervious/Energetic/Powerful, ~10%) ma Riset Helm (Scorpionmantis, Egeha), a „Casting-Up” (A)
  dopiero hełmy od 107 poziomu — czeka na decyzję właściciela, czy coś zmieniać.

**Cel końcowy (właściciel):** cała gra w **prywatnym repo**, hostowana tak, żeby dało się grać na telefonie
i komputerze w dowolnej chwili; na końcu **Supabase** (konta, logowanie, zapis w chmurze, logika po stronie
serwera). Najpierw robimy wszystko, co się da na froncie.

**Decyzje właściciela:** 6 klas na start (Titan, Knight, Healer, Mage, Rogue, Sorcerer); tempo exp jak w LC
(będą bonusy); dane 1:1 z bazy; repo przejdzie na prywatne (GitHub Pro); od 2026-10-29 skonwertowane modele
i dane LC są w repo i na Pages (surowy klient i zrzut bazy — nie).

**Następne kroki:**

1. **System tytułów** — plan przedstawiony właścicielowi (t_title 1:1: 199 tytułów, czas, opcje, kolory,
   przedmiot „Other”, okno Titles, tytuł pod nickiem), czeka na akceptację i decyzję, skąd gracz je dostaje.
2. Plan klienta krok po kroku (zrobione: 1 spis, 2 klasy, 3 potwory Juno, Dratan, Merac, Egeha, 4 wygląd
   sprzętu, 6 animacje i efekty skilli, teren Juno): teren Dratan i kolejnych stref (spawny z bazy pasują —
   walki w prawdziwych miejscach), drzewa/budynki z `.wld`, potwory pozostałych stref
   (`npm run convert-lc -- --client "assets-src/client-full/LastChaos Nemesis" --only <model ids>`),
   brakujące ikony z `ItemBtn19.tex` (`--only icons`), modele sprzętu zaszyfrowane w Nemesis (z klienta 2015),
   efekty 1:1 z `Effect.dat` (jeśli w kliencie od właściciela jest jawny). Kod serwera LC (statystyki
   klas, wzory walki, szanse ulepszeń) — nadal brak; czekamy na właściciela.
3. Dalej: M6 do końca (osobne tło / teren każdej strefy, gdy będą mapy z klienta; ewentualny wymagany poziom
   strefy — na razie właściciel chce swobodnego wyboru), żywioły, opcje specjalne, które jeszcze nie działają.
4. Etap 2 (Supabase) według `docs/supabase.md` — dopiero po zgodzie właściciela.

**Otwarte kwestie:** czcionka (bitmapy klienta są nieczytelne na telefonie — pytanie do właściciela); bossy
rajdowe (pomysł właściciela); nagrody księgi potworów; spawny Juno niepasujące do mapy klienta; brak w bazie statystyk startowych klas (także many) i wzorów walki
(w tym jak `a_power` umiejętności przekłada się na obrażenia, czym są podtypy `t_magic`, jednostki regeneracji)
— źródło: kod serwera (właściciel go ma). Klient z jawnymi teksturami (zapowiedziany przez właściciela):
przepuścić przez `convert-lc` jako drugi `--client` (tekstury sprzętu 60–109, `ItemBtn19`, `Effect.dat`?).

# Spawny, trasy, walka z dystansu, mikstury-wzmocnienia i partia GUI (2026-11-05)

Claude Code, na polecenie właściciela: „Wprowadź wszystkie 4 [etapy zrzutu bazy] po kolei, a po tym
dodaj…” (11 punktów; punkt 12 był pusty). Punkt wyjścia `0be9812`. SaveVersion nadal **14**
(nowe pole zapisu `boosts` jest opcjonalne, starsze zapisy wczytują się bez migracji).

| Commit    | Zakres                                                                    |
| --------- | ------------------------------------------------------------------------- |
| `63377de` | pełny import zrzutu 2016 (etapy 2–4 + dane spawnów)                       |
| `9dd82c1` | etap 1: walka w spawnach Dratan/Merac/Egeha, nav.bin i trasy biegu        |
| `3a29b80` | walka z dystansu (Healer, Mage, Rogue z kuszą)                            |
| `bf73c70` | partia GUI (Skills X, AUTO mikstur, Settings, loader, złoto, Gold, tekst) |
| `4ab0d3a` | Potion of Haste, Platinum Adrenaline, 100 Cooldown Reduction Potion       |
| `67671a3` | zielone/czerwone zmiany statystyk w komunikatach                          |

## 1. Zrzut bazy 2016 — cztery etapy

Szczegóły i pomiary: [db-2016-dump.md](db-2016-dump.md); decyzje D01/D02/D04/D08/D24 w
[rejestrze](design-decisions.md). `lc-data.json` pochodzi z pełnego importu obecnym importerem.

- **Spawny** (`import-db.mjs` `huntingPoint`): dla potwora i strefy punkty `t_npc_regen` warstwy 0
  łączone w grupy co 40 m; wybierana największa grupa (suma `a_total_num`), punkt = jej medoid.
  Pole `spawns: { 'lc-zone-N': [x, z] }` w danych potwora, `MonsterDef.spawns`.
- Na Dratan/Merac/Egeha konwerter (`--only terrain --map …`) ustawia areny = spawny w kolejności spotów
  (`terrain.json` `"spawns": true`); `huntingGround` stawia walkę w spawnie potwora. **Juno bez zmian**
  (spawny z innej wersji mapy, własne areny).
- Etapy 2–4 włączają uśpiony kod Codexa: `hitrate` skilli, `rollSourceDrops` (4 próby z 20 slotów),
  CON / magic avoid / typ ataku / `npcSkills`.

## 2. Bieg między spotami (punkt 1)

- `public/maps/<map>/nav.bin` (`scripts/lc/nav.mjs`, `--only nav`): siatka 4 m, 1 bit na komórkę.
  Dratan i Merac z pliku atrybutów klienta `.sat` (255 = drzewa, skały, mury, woda, urwiska;
  sprawdzone: wszystkie spawny na polu chodliwym, drzewa na zablokowanym). Juno i Egeha nie mają
  pasującego `.sat`: nachylenie > 3 m na 4 m, pnie drzew (3 m), skały/mury/domy (0,8 promienia
  ramki), bez trawy i krzewów, bez obiektów > 40 m (podłoża, długie mury); Juno dodatkowo rzeka
  (warstwa tekstury 8).
- `src/game/logic/navigation.ts`: A* (8 kierunków, bez ścinania rogów, zablokowane pola tylko jako
  ostateczność ×40), prostowanie linią wzroku. Najgorszy przypadek ~140 ms na Dratan (komputer).
- `combat.ts`: `travel { distance, done }` — metry trasy pokonywane z bieżącym Run speed (mikstura
  wypita w biegu skraca tylko resztę). Bez mapy domyślnie 15 m (dawne 2,5 s przy 6 m/s).
- `travelRoute.ts`: sklep planuje trasę od miejsca, gdzie mapa stoi; `MapGround` przesuwa mapę po
  łamanej, bohater obraca się z odcinkami, rysowanie między krokami 50 ms (`view.interpolationSeconds`).
- **Długości są prawdziwe**: sąsiednie spoty Dratan bywają oddalone o 2,3 km (≈6 min biegu przy 6 m/s),
  Merac do 1,3 km, Egeha do 2 km.
- Pliki map mają `?v=` (`MAP_REVISION` w `lcMap.ts`), bo service worker serwuje je najpierw z cache.

## 3. Walka z dystansu (punkt 2)

Źródło: `PC.cpp CalcStatus` + `Config.h ATTACK_RANGE_*`, `ApplyItemPlusValue`, `MobActivity.cpp MobMoveTo`.

- Zasięg bohatera (`attackRange.ts`): Titan/Knight 2,3 m, Healer 20, Mage 15, Rogue 2,3 (sztylety) /
  15 (kusza), Sorcerer 3; łuk, kusza, kostury, różdżki +2 m od +8. Potwory: `a_attack_area`,
  bieg `a_run_speed` (`npcRunSpeed`).
- Zasięg > 5 m: bez podbiegania; walka zaczyna się od razu, potwór przebiega
  `zasięg bohatera − zasięg potwora` metrów z własną prędkością (nie gdy stun/hold) i dopiero wtedy
  atakuje. Pozostali nadal podbiegają. AFK liczy to samo (`combatTick`).
- Scena: potwór pojawia się w zasięgu, przed kamerą, z boku, biegnie po terenie mapy (`view.groundY`);
  kamera przesuwa się najwyżej 3 m w stronę potwora.

## 4. Partia GUI (punkty 3–7, 10, 11)

- **Skills**: tekstura `skill_new` ma wtopiony przycisk zamknięcia; `ui.mjs` (`MIRRORED`) zakrywa go
  lustrzanym lewym narożnikiem — zostaje jeden X gry.
- **Okno slotu mikstury**: AUTO jako pole wyboru klienta, mikstura w slocie podświetlona i z plakietką
  IN SLOT / AUTO; slot HUD z AUTO ma pulsującą złotą poświatę.
- **Settings**: pola wyboru `NewOption` (`check.webp`, `check-off.webp`) zamiast pergaminowych zakładek
  i przełączników CSS, separatory strony opcji (`divider.webp`).
- **Loader stref**: cały obrazek 944×344 we własnych proporcjach, na szerokość ekranu, nazwa i pasek
  pod nim (rozciągnięty na cały ekran telefonu wyglądał na przybliżony i rozmazany). To zastępuje
  wcześniejsze `100% 100%`.
- **Złoto**: jedna mała ramka `value-box` w Shop, Appraiser i Inventory.
- **Expedition**: wiersz Gold na całą szerokość. **Ładowanie**: „Loading IdleLC…”.

## 5. Mikstury-wzmocnienia (punkt 8)

Z bazy (`BOOST_POTIONS` w importerze, efekty z `t_skill` / `t_skillLevel` / `t_magic`):

| Przedmiot                          | Skill       | Efekt                                   | Czas  | Flagi                           | Sklep                         |
| ---------------------------------- | ----------- | --------------------------------------- | ----- | ------------------------------- | ----------------------------- |
| 391 Potion of Haste                | 70          | Run speed +1,0 m/s                      | 200 s | HELP (znika przy śmierci)       | miasta, 200 gold              |
| 2138 Platinum Adrenaline           | 429         | Attack speed +15%, Run speed +1,5 m/s   | 1 h   | NOCANCEL                        | Juno, 770 gold                |
| 6916 100 Cooldown Reduction Potion | 1340 poz. 5 | STAT37 skill cool time 100 (reuse ×0,3) | 1 h   | NOCANCEL, ABSTIME, NOTDUPLICATE | wszędzie, **50 000 (własna)** |

- **W bazie nie ma mikstury szybkości rzucania** (STAT23 używają tylko skille klas). Jako „100% cast”
  dodano miksturę **100** z rodziny Cooldown Reduction — do potwierdzenia przez właściciela.
  Jest w bazie przedmiotem cash shopu (cena 0), więc cenę ustalono samodzielnie.
- Walka: wzmocnienie to buff z torby (nigdy nie pite samo), czas odnowienia osobny dla każdego
  skilla, drugi ten sam skill zastępuje pierwszy, NOTDUPLICATE blokuje drugi, NOCANCEL przetrwa
  śmierć (serwer: `ClearAssist`), STAT37 → `cooldownReduction` (wzór `Skill.cpp`).
- Zapis: `CharacterData.boosts` (`logic/boosts.ts`). Haste i Adrenalina odliczają czas gry (sesja
  i wyprawy), ABSTIME — zegar (także gdy gra jest zamknięta). Raport walki przenosi pozostały czas;
  wczytanie zapisu waliduje wpisy.

## 6. Zmiany statystyk w komunikatach (punkt 9)

`src/ui/statChanges.tsx`: po założeniu/zdjęciu/ulepszeniu sprzętu, zmianie tytułu i wypiciu mikstury
komunikat zawiera różnice wartości okna Character (zielone lepsze, czerwone gorsze, max 6 linii);
mikstury leczenia/many pokazują, co przywracają. Takie komunikaty trwają 4,6 s.

## Weryfikacja

`npm run check` — **453 testy / 52 pliki** (nowe: `navigation`, `attackRange`, `boosts`, testy podróży
i walki z dystansu w `combat.test.ts`). Chromium 390×844: bieg Dratan 482 m przy 6 m/s, walki w spawnach
Dratan/Merac/Egeha, Healer strzela, zanim Harpia dobiegnie, okna GUI, wypicie i zapis/odczyt wzmocnień,
komunikaty zmian statystyk. Nie sprawdzono FPS na iPhonie.

# Zrzut bazy z lutego 2016 (`newproject_data.sql`): co zawiera i co zmieniłby pełny import

Data: 2026-11-05. Sprawdził Claude Code na prośbę właściciela.

> **Stan (2026-11-05, później tego dnia): wszystkie cztery etapy są wdrożone** — właściciel
> zatwierdził je („Wprowadź wszystkie 4 po kolei”). `lc-data.json` pochodzi z pełnego importu
> obecnym importerem (`npm run import-lc-db -- --dump <zrzut>`), łącznie z `spawns`, `attackArea`,
> `walkSpeed` i `runSpeed` potworów. Decyzje D01/D02/D04/D08/D24 zapisano w
> [rejestrze](design-decisions.md). Opis poniżej zostaje jako zapis pomiarów sprzed importu.

Pierwotny opis (przed decyzją): ten dokument opisywał wynik sprawdzenia i decyzje, które musiał
podjąć właściciel przed pełnym importem.

## Pochodzenie

| Plik                                                                                                                                          |      Rozmiar | SHA-256                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -----------: | ------------------------------------------------------------------ |
| [`lastchaos-database-master-February-2016 2.zip`](https://drive.google.com/file/d/133EYk_OXU3qxzKu8OpDTw1wlf_NH5ffE/view) (Drive właściciela) | 10 376 903 B | `7e95f197f8313c199925e2e6712f8a686b9e8192aa570d9acf5347b7b07ce4d1` |
| `lastchaos-database-master/newproject_data.sql` (w archiwum)                                                                                  | 54 828 277 B | `0cae2afd637966dd365f22a2795ba5402c29061aa83d01b84e6a8f7ce031d85d` |

README archiwum: „Dump date: february 2016, Source: official development server”
(republikacja `openlastchaos/lastchaos-database`). Surowy zrzut **nie trafia do repozytorium**
(zasada P13); trzymaj go poza checkoutem i podawaj ścieżkę importerowi.

**Ważne:** to jest ten sam plik (identyczny SHA-256 `newproject_data.sql`), z którego Claude zrobił
pierwszy import 2026-10-28…30. Obecny `lc-data.json` pochodzi więc z tego zrzutu, ale z **wcześniejszej
wersji importera**, która nie zapisywała części kolumn. Codex w audycie pisał, że „pełnego SQL nie ma”,
bo nie miał dostępu do pliku — on jest, tylko eksport był niepełny.

## Co jest w zrzucie (a czego brakowało w eksporcie)

81 tabel, m.in. `t_npc`, `t_npc_regen`, `t_skill`, `t_skillLevel`, `t_magic`, `t_magicLevel`,
`t_item`, `t_option`, `t_rareoption`, `t_title`, `t_shop`, `t_exp`, `t_zonedata`, `t_npc_drop_all`,
`t_npc_dropjob`, `t_npc_dropraid`. Dla tematów otwartych w audycie:

- **`t_npc_regen`** (`a_zone_num`, `a_npc_idx`, `a_pos_x/z/h/r`, `a_y_layer`, `a_regen_sec`,
  `a_total_num`) — pozycje spawnów. Porównanie wysokości spawnu z terenem gry (`public/maps/*/heights.bin`):

  | Strefa | Wiersze | Potwory | Różnica wysokości: mediana / p90 | Wniosek                                               |
  | ------ | ------: | ------: | -------------------------------- | ----------------------------------------------------- |
  | Juno   |    1156 |     112 | 35,9 m / 76,6 m                  | nie pasuje (inna wersja mapy, znane od 2026-10-30)    |
  | Dratan |    1971 |     145 | 0,60 m / 0,88 m                  | pasuje 1:1 — prawdziwe miejsca walk są do odtworzenia |
  | Merac  |     856 |      73 | 0,60 m / 0,79 m                  | pasuje 1:1                                            |
  | Egeha  |    1069 |      47 | 0,60 m / 0,83 m                  | pasuje 1:1                                            |

- **`t_magicLevel.a_hitrate`** — szansa trafienia efektu skilla. W pełnym imporcie wszystkie 728
  poziomów efektów mają `hitrate`. Kontrola nauki (`isAvailable`) przepuszcza wtedy **100/119**
  skilli zamiast 93/119 (+7); pozostałe 19 blokują inne braki (aktorzy summonów itp.).
- **`t_npc`**: `a_str/dex/int/con`, `a_hit`, `a_dodge`, `a_magicavoid`, `a_attackType`,
  `a_attacklevel/defenselevel`, `a_recover_hp/mp`, 20 slotów dropu `a_item_0…19` z
  `a_item_percent_*` (także puste), skille potworów `a_skill0…3`. Wszystkie 120 grywalnych potworów
  ma CON i magic avoid; 15 ma własne skille (np. Doom Slayer: atak magiczny + skill 113).

## Co zmieni pełny import obecnym importerem

Próba: `node scripts/lc/import-db.mjs --dump <zrzut> --out <katalog tymczasowy>` (bez zapisu do
repozytorium). Nowe pola: potwory `flag, attackType, strength…constitution, recoverHp/Mp, magicAvoid,
attackLevel, defenseLevel, dropSlots, skills`; efekty skilli `magicLevel, hitrate, hitType, attribute,
toggle, power/hit source/target`; `npcSkills` (umiejętności potworów). Kod gry Codexa włącza na tych
danych dotąd uśpione reguły:

1. **Drop według źródła** (cztery próby wśród 20 slotów, `rollSourceDrops`). Pomiar 20 000 zabić,
   przedmioty na 100 zabić: Deer 38,9 → 8,9; Elite Gandor 244,5 → 50,3; Harpy 150,7 → 31,7;
   Doom Slayer 55,9 → 12,6; Cursed Lich 16,9 → 4,6. **Łupy spadają ok. 4–5 razy rzadziej.**
   Smelting Stone (1%) i akcesoria (0,5%) zostają jak dotąd (`GENERAL_DROPS`, `accessoryDrops`).
2. **Typy trafień z prawdziwym CON i ataki magiczne potworów.** Większość par bohater/potwór zmienia
   się o kilka procent, ale część potworów robi się wyraźnie groźniejsza: Doom Slayer (38) dla bohatera 38. poziomu z sprzętem startowym — śmierci/h 15–126 → 93–177, zabicia spadają do 0; Cursed Lich (90)
   — śmierci/h 72–162 → 156–225. (Bohater próbny ma tylko sprzęt startowy, więc liczby bezwzględne
   na wysokich poziomach są zaniżone; ważny jest kierunek zmiany.)
3. **+7 skilli do nauczenia** (szanse trafienia efektów są znane).

Testy projektu (`npm run check`) i tak używają danych zastępczych, więc nie wykryją zmiany balansu —
po imporcie trzeba osobno sprawdzić grę na prawdziwych danych.

## Proponowane etapy (do decyzji właściciela)

1. **Spawny Dratan / Merac / Egeha** — miejsca walk i kolejność spotów z `t_npc_regen` (potwór walczy
   tam, gdzie stoi w oryginale). Bez wpływu na balans. Juno zostaje na obecnych arenach.
2. **Szanse trafienia skilli** — import `hitrate` (+7 skilli do nauki). Mały wpływ.
3. **Drop według źródła** — decyzja D08: przyjąć ~4–5× rzadsze łupy czy zostać przy obecnym
   niezależnym losowaniu wpisów.
4. **CON, magic avoid, ataki magiczne i skille potworów** — decyzja D01/D02/D04: przyjąć trudniejsze
   potwory (zwłaszcza magiczne) czy wyrównać balans.

Etapy 3–4 wymagają zgody właściciela (zmiana balansu, rejestr decyzji). Przed etapem 1–2 importer
trzeba uruchomić tak, żeby nie włączyć od razu 3–4 (np. flaga importu lub reguła w kodzie) — nie
zmieniać `lc-data.json` jednym pełnym importem bez tej decyzji.

## Wdrożenie (2026-11-05)

- **Etap 1 — spawny:** importer zapisuje dla każdego potwora i strefy punkt polowania
  (`spawns`, `import-db.mjs` `huntingPoint`: wiersze `t_npc_regen` warstwy 0 łączone w grupy co
  40 m, największa grupa wg `a_total_num`, jej medoid). Konwerter terenu (`--only terrain --map
dratan|merac|egeha`) używa tych punktów jako aren w kolejności spotów (`terrain.json`
  `"spawns": true`), a gra stawia walkę dokładnie w spawnie potwora (`huntingGround`). Juno zostaje
  na własnych arenach (jej spawny są z innej wersji mapy).
- **Etap 2 — hitrate:** w danych; kontrola nauki przepuszcza teraz więcej skilli (pomiar wyżej).
- **Etap 3 — drop według źródła:** `dropSlots` są w danych, więc `rollSourceDrops` (cztery próby
  wśród 20 slotów) działa dla wszystkich potworów z pełnym wierszem.
- **Etap 4 — NPC:** CON, magic avoid, typ ataku i skille potworów (`npcSkills`, `monsterFighter`)
  działają na prawdziwych danych.

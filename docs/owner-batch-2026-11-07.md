# Czwarta partia zgłoszeń właściciela (Claude Code, 2026-11-07)

Commity `fbfa760`, `0b2620c`, `fc214eb`, `a2c27e4`, `5af11a6`, `4b7c99f`, `3778db7`.
SaveVersion nadal **16**: nowe pola są opcjonalne albo mają wartość domyślną przy wczytaniu
(`CharacterData.runFrom`, `SaveData.cash`), więc migracja nie była potrzebna.
580 testów / 70 plików, próby Chromium 390 × 844.

## Co zrobiono

1. **Przycisk Dungeons spokojniejszy.** To kwadrat zdarzeń z prawej strony ekranu klienta
   (ramka `EventBtn0.tex`) ze znakiem podziemi z mapy świata. Ma 40 px, bez podpisu
   i bez pulsującej poświaty.
2. **Mikstury HP/MP w drodze.** Auto-picie działa we wszystkich fazach poza porażką: w biegu
   między spotami, przy pojawianiu się potwora, w podejściu i po zabiciu (`combat.ts`,
   `drinkPotions`).
3. **Suwaki z GUI klienta.** Każdy `input[type=range]` ma metalową listwę i złoty trójkąt
   z `NewOption.tex` (`slider-track.webp`, `slider-thumb.webp`).
4. **Kolejność mikstur.** W torbie i w torbie rundy najpierw boosty (Haste, Adrenaline, Cast…),
   potem HP, potem MP, w grupie wg poziomu i siły (`comparePotions`).
5. **Zamknięcie gry w biegu nie skraca drogi.** Bieg zapamiętuje spot startowy
   (`CharacterData.runFrom`). Po zamknięciu karty w trakcie biegu postać wraca na ten spot.
6. **Pięć nowych buffów podziemi** (stały poziom, bez ulepszania; dane 1:1 z `t_skill`/`t_magic`):
   - Basic Ignition poziom 2: +200% ataku fizycznego i magicznego (prośba właściciela);
   - Attack Power Increase [Horse] poziom 30: +60 ataku (prośba właściciela);
   - Armor Increase [Horse] poziom 30: +250 obrony (prośba właściciela);
   - **mój wybór:** HP/MP up [Mount] poziom 10: +500 HP i +500 MP (przetrwanie hordy);
   - **mój wybór:** Magical Power [Dragon] poziom 30: +30 ataku magicznego, odpowiednik konia
     dla magów, kapłanek i czarowników.
7. **Uzdrowicielka w biegu ma animację biegu.** Gdy gracz prowadzi postać joystickiem, strzały
   i czary lecą bez klipów zamachu, a klip biegu się nie urywa.
8. **Skrzynki Belfist / Procyon / Maargadum Box** (własne przedmioty 95001–95003):
   - 5% szans na skrzynkę z każdego zabitego potwora w podziemiu;
   - skrzynka leży na podłodze jako oryginalny model 3D z klienta
     (`Data\Item\Common\ITEM_treasure02.smc`, model dropu skrzynek klienta), z delikatnym złotym
     kręgiem;
   - postać podnosi ją, wchodząc na nią; trafia do torby i do łupów rundy;
   - w torbie „Open” / „Open all”: Smelting Stone ×1 (80%) albo Heaven Stone ×1 (20%).
     Wartości do podkręcenia w `src/game/data/boxes.ts`.
9. **Nowe mikstury z bazy** (boosty, tak jak liczy je serwer):
   - HP i MP steal potion: 30% trafień oddaje 5% obrażeń jako HP / 10% max MP
     (`Battle.cpp`);
   - Berserker Potion: 10% ciosów w potwory zadaje podwójne obrażenia
     (`Battle_GetDamage.cpp`);
   - Power Potion, Strength / Dex / Constitution / Intelligence Potion (+15 na godzinę), Shield,
     Magic Shield (+30% obrony / obrony magicznej na 3 h), Small / Medium / Big Special
     Potion-Crt.
10. **Sklep za Cash** (przycisk z prezentem pod Dungeons):
    - wygląd i grafiki z `Cashshop.tex` klienta 2015 (obrazki kategorii, znaczniki HOT/NEW,
      ramka przedmiotu);
    - zakładki HOT, Items, Potions, Packages;
    - waluta **Cash** należy do konta (jak w kliencie), pole `SaveData.cash`;
    - w trybie dev przycisk „+10,000 Cash”.
11. **Pozostałe przedmioty z listy:** Large Attack / Defense Potion, czekolady (Small/Medium/Large,
    Red, White), Candle, Red Lucky Pouch, Blessed Iris (+100% EXP na 3 h) i Platinum Super
    Skill Pill (+200% SP na 1 h). Premie EXP/SP działają teraz także na zwykłych spotach
    i wyprawach, nie tylko w podziemiach.

## Ceny w sklepie Cash

Gdzie katalog bazy (`t_catalog`) sprzedaje to samo, cena jest oryginalna:

| Oferta                                                   |  Cash | t_catalog |
| -------------------------------------------------------- | ----: | --------- |
| Blessed Iris                                             | 2 100 | 50        |
| Platinum Super Skill Pill                                | 1 700 | 216       |
| Platinum Adrenaline                                      | 2 100 | 241       |
| HP steal potion ×10                                      | 2 900 | 236       |
| MP steal potion ×10                                      | 2 900 | 237       |
| Proficiency Package (Iris ×2, pigułka ×5, Adrenaline ×1) | 9 900 | 372       |

Pozostałe ceny i paczki są **własne** (oznaczone `own` w `src/game/data/cashShop.ts`), np.
Super Haste 1 500, 100 Cooldown 2 100, Berserker 2 900, potki statystyk 1 000, Heaven Stone 300.

## Pytania do właściciela

1. **Skąd gracz ma brać Cash?** Na razie tylko dev („+10,000 Cash”). Propozycje: punkty podziemi,
   nagrody księgi, codzienne logowanie.
2. **„Czerwone i niebieskie Kar 12 lv” oraz „Neony 12 lv”:** nie znalazłem takich nazw w bazie
   (angielskie `a_name_usa`). Najbliżej są klejnoty socketów Lv.12 (Spinel, Lapis…), ale gra
   nie ma socketów. Proszę o nazwę z gry albo zrzut ikony.
3. **Ignition poziom 2 daje +200% ataku** (tak jest w `t_magic`). To bardzo mocny buff: czy
   zostawić, czy dać go rzadziej?

## Dla Codexa: co zmieniłem w Twoich plikach

- **`src/game/logic/dungeons.ts`**
  - `DungeonBox` i `DungeonRun.boxes?` (opcjonalne);
  - w `dungeonStep` każde zabójstwo losuje skrzynkę (`DUNGEON_BOX_CHANCE`), czyli jedno
    dodatkowe `rng()` na zabicie;
  - skrzynkę bliżej niż `DUNGEON_BOX_REACH` (1,2 m) zbiera gracz; wynik kroku ma pole `boxes`
    (id przedmiotów).
- **`src/game/service/LocalGameService.ts`**
  - `advanceDungeon` wkłada zebrane skrzynki do torby (`stowDrops`) i do `run.rewards.drops`;
  - nowe komendy `openBoxes` i `buyCashOffer`, w dev `addCash`.
- **`src/game/logic/dungeons.test.ts`:** test puli liczy 6 klas tylko wśród buffów klasowych.
  Nowe buffy mają `sourceLevel` i pochodzenie `item` / `horse` / `mount` / `dragon`.
- **`scripts/lc/import-db.mjs`**
  - `EXTRA_DUNGEON_BUFFS` dokłada do `dungeonBuffs` pięć definicji z jednym poziomem
    (przenumerowanym na 1, `sourceLevel` = poziom źródłowy, czas 600 s);
  - nowe `BOOST_POTIONS`, `HARDCODED_BOOSTS` (steal, berserker, EXP/SP);
  - `OWN_ITEMS` (skrzynki 95001–95003);
  - przedmiot **2453** (pigułka) jest teraz także miksturą `boost` z `rewards.sp = 200`.
    Twój superbuff z tym `itemId` działa bez zmian, bo efekt bierze z definicji superbuffa.
- **`src/ui/dungeons/DungeonBuffer.tsx` / `Dungeons.tsx`:** dla buffów z `sourceLevel` jest
  napis „Lv 30, fixed” i „rank 30” zamiast „Lv 1 / 1”.
- **`src/scene/DungeonScene.tsx`:**
  - `<DungeonBoxes>` rysuje skrzynki z `run.boxes`;
  - wcześniej w tej partii: flaga `heroMoving` i brak klipów ataku gracza w biegu.
- **`src/ui/dungeons/dungeons.css`, `Dungeons.tsx`:** przycisk Dungeons bez podpisu i poświaty,
  grafika `menu-dungeons.webp` (ramka zdarzeń).
- **`src/ui/dungeons/DungeonLoot.tsx`:** mikstury posortowane `comparePotions`.
- **`scripts/lc/dungeon-art.mjs`, `ui.mjs`:**
  - `dungeonButton` ma parametr `brightness`;
  - nowe części `slider-*`, `event-frame` i `cash-*`;
  - nowy plik `menu-shop.webp`.
- **Do decyzji:** `combat.ts` czyta STR/DEX/INT/CON (`MST_STAT` 29–32) **tylko dla mikstur**.
  Twoje buffy 161 Fire Command, 1620 Ultimate Strength i 1806 Mark of Thunder też je mają, ale
  dziś są pomijane przez `interpretEffect`. Nie zmieniałem ich działania.

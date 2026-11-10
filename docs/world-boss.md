# World Boss (2026-11-10, Codex)

System działa w oglądanej walce idle. Przywoływanie i progi są regułami właściciela;
modele, statystyki, umiejętności NPC i tabele przedmiotów pochodzą z dostarczonych
plików LC. Nie zmienia systemu Dungeons, sklepu Cash ani artefaktu Seraphim.

## Bossy i licznik

| Mapa       | NPC z `t_npc` | Nazwa w bazie          | Zabójstwa do przywołania |
| ---------- | ------------- | ---------------------- | -----------------------: |
| Juno (0)   | 308           | Grand Balrog           |                     2000 |
| Dratan (4) | 307           | Grand Devilroad Kamira |                     1800 |
| Merac (7)  | 309           | Grand Red Dragon       |                     1600 |
| Egeha (15) | 331           | Grand Golden Dragon    |                     1500 |

Dratan używa **307, nie Baala 152**. Kamira nie ma wpisu `t_npc_regen` w tym zrzucie;
jej przypisanie do Dratan jest jawną regułą tego systemu. NPC pozostają poza listą
zwykłych spotów. Nie zmieniono statystyk istniejących NPC ani progów otwierania map.

`CharacterData.worldBoss` to opcjonalne pole zapisu **v16**: `kills` i `defeated`
osobno dla każdej mapy oraz `active` dla pojedynczej próby. Każda postać ma własny
postęp. Starszy zapis zaczyna od zera, bez przeliczania historycznych zabójstw.
Zmiana mapy zachowuje jej licznik, pełny licznik zatrzymuje się na progu.

Licznik zwiększa wyłącznie `LocalGameService.reportCombat`, po przyjęciu zwykłego
raportu pola. Czas z widocznej sceny wyznacza `VisibleClock`. AFK, ekspedycje,
Dungeons i pokonanie samego bossa nie dodają ładunków. Gotowy przycisk po lewej
ma złotą poświatę; górny półokrąg wypełnia się od lewej do prawej. W drodze do
zwykłego spotu trzeba najpierw dobiec, zgodnie z dotychczasową zasadą przemieszczania.

## Przebieg próby

Przywołanie atomowo zużywa pełny licznik i tworzy `encounterId`. Bieżący potwór
znika bez nagrody. Zapis `location` nadal wskazuje zwykły spot. Pole
`active.arenaMonsterId` wybiera kolejny istniejący plac walki tej samej mapy;
`planTravel` planuje tam trasę po terenie, a Run speed określa czas biegu. To miejsce
**przywołania**, nie deklaracja odtworzenia oryginalnego respawnu bossa.

Walka używa zwykłych statystyk, skilli, buffów i mikstur postaci. `singleEncounter`
w `CombatSession`/`combatTick` zatrzymuje symulację po pierwszej śmierci, także przy
długiej klatce, dopóki serwis nie rozliczy wyniku. Przełączanie spotów, map,
ekspedycja i Dungeons są podczas próby zablokowane. Sprzęt i zwykłe okna pozostają
dostępne. Przycisk `Leave boss` zajmuje miejsce przycisku ekspedycji.

Po zwycięstwie serwis wypłaca drop raz, zapisuje zabójstwo i zatrzymuje grę z oknem
łupów. Zamknięcie okna rozpoczyna bieg na poprzedni spot. Raport musi mieć bieżące ID i właściwe NPC; stary raport zwykłego
potwora, ponowione rozliczenie i raport kilku bossów są odrzucane.

**Śmierć:** decyzja właściciela z 2026-11-10: zakończyć próbę, wrócić na poprzedni
spot, ponownie nabić licznik. Nie ma dropu ani zwrotu ładunku; zwykła kara za śmierć
pozostaje. Wyjście z próby, wylogowanie i przeładowanie strony również ją kończą.
Reload nie symuluje bossa offline i nie wypłaca nagród. Ładunek został już zapisany
jako zużyty, więc nie można ponawiać losowania przeładowaniem.

## Druga partia: stoper, tabela łupów i DEV

Przycisk ma teraz portret **32 × 32 px** i półokrąg szerokości **45 px**, o połowę
mniejsze od pierwszej wersji. Jest po lewej na 50% wysokości ekranu, z zachowaniem
czytelnego tekstu licznika i pola dotyku.

DEV ma przycisk **Fill World Boss charge**. Napełnia bieżącą mapę, nie zmienia
zabójstw w statystykach ani progów innych map. `devCharges` oznacza pochodzenie
następnej próby. Nie można napełniać w trakcie bossa, okna wyniku, AFK lub Dungeons.

`CombatState.encounterClock` powstaje wyłącznie dla pojedynczej próby. W fazie
`fighting` pierwsze `attack` gracza, ofensywne `cast` (attack/debuff) lub
`summonAttack` uruchamia licznik. Kolejne kroki symulacji dodają czas do pierwszej
śmierci. Nie liczy traveling, spawning, approach, pauzy, tła ani opóźnienia serwisu.
Duża klatka przechodząca przez kilka faz nie dolicza ich do czasu walki. HUD
wyświetla ten sam licznik w formacie `MM:SS`; raport przekazuje go do serwisu.

`worldBoss.history` zapisuje każdą zakończoną próbę: `encounterId`, `zoneId`,
`monsterId`, `endedAt`, `combatMs`, `outcome` (victory/death/left/interrupted),
`assisted`. `combatMs=null` oznacza brak pierwszego ataku lub stary zapis bez
pomiaru. Dla przerwania reloadem dostępny jest ostatni zapisany pomiar z raportu;
przerwane próby nie są zwycięstwami do rankingu. W przyszłym rankingu kwalifikują
się zwycięstwa z pomiarem i `assisted=false`. Napełnienie DEV, tempo inne niż ×1,
Kill target, Heal i komendy DEV w czasie próby oznaczają ją jako testową. Ranking
online pozostaje przyszłą funkcją; nie jest tu dodawany.

Zwycięstwo zapisuje `worldBoss.pending` razem z nagrodami: rekord, arenę, EXP,
gold, SP i listę dropów. `worldBossResult` w store zatrzymuje Canvas
(`frameloop='never'`) i blokuje kolejne raporty. Modal używa klientowego `Sheet`,
tabeli nagród, ikon przedmiotów, ikonki i kolorów złota. Przy raid ACC widać
adnotację Unidentified. Wynik pozostaje po reloadzie. Zamknięcie wywołuje
`acknowledgeWorldBossLoot`, które usuwa pending i ustawia lastPlayedAt na teraz:
**nie wypłaca ponownie** i nie dolicza czasu oglądania tabeli do aktywnej gry.
Powrót następuje trasą mapy; po reloadzie arena jest zapasowym początkiem trasy.

To nadal opcjonalne pola **v16**. Starsze zapisy i trwające stare próby zachowują
postęp; próby bez zegara nie dostają fikcyjnego wyniku czasowego.

Weryfikacja drugiej partii: **600 testów / 72 pliki**, lint, formatowanie i TypeScript.
Chromium: przycisk DEV napełnił licznik, portret miał dokładnie 32 × 32 px, środek
przycisku 422 px przy wysokości 844 px. Podczas biegu zegar wynosił zero i był
niewidoczny; w walce przy ×1 przyrósł o 2,55 s w obserwacji około 2,2 s plus czas
wykonania komend automatyzacji. Wygrana testowa zapisała 11900 ms i assisted=true.
Tabela miała 13 wierszy (nagłówek, trzy waluty, dziewięć przedmiotów). Przez pauzę
nie zmienił się zegar ani liczba wyrenderowanych klatek (`frameloop=never`, klatka
48). Sprawdzono układ 320/390/1280 px, reload i zamknięcie modalu: łupy oraz
historia bez duplikacji, ponowny bieg na spot trasą 129,8 m. Końcowa próba bez
błędów JS, konsoli, HTTP i żądań. To kontrolowany test integracji z narzędziami DEV,
nie pomiar balansu ani naturalnego czasu pokonania bossa.

Build produkcyjny również przeszedł próbę przywołania, zwycięstwa i odtworzenia
okna po reloadzie: przygotowana postać pokonała Balroga przy ×20, bez wymuszania
Kill target. Zapisano 150450 ms i znacznik testu; łupy po reloadzie były pojedyncze,
Continue wznowiło grę. Bez błędów JS, konsoli, HTTP i żądań.

## Drop z serwera

Źródło: dostarczony `newproject_data.sql`, SHA-256
`0cae2afd637966dd365f22a2795ba5402c29061aa83d01b84e6a8f7ce031d85d`.
Importer eksportuje osobno `t_npc_dropraid` do `lc-data.json.worldBosses`.

Odniesienia do źródła serwera listopad 2018:

- `GameServer/NPCProto.cpp:460` wczytuje raidową tabelę uporządkowaną po indeksie przedmiotu;
- `GameServer/hardcoding.cpp:11`, `DropRaidMonsterItem`, losuje **każdy wiersz
  niezależnie**: `GetRandom(1, 10000) <= prob`, z oryginalnym `count`;
- `GameServer/Battle_NPCDropItem.cpp:79` zachowuje 20 zwykłych slotów i cztery próby;
- `ShareLib/Config.h:638`, `ITEM_FLAG_RARE = 1 << 15`, rozróżnia rare od artefaktów;
- `Config.h:822` definiuje zwykłe akcesoria 0..5, w tym naszyjniki 5; zwierzaki
  6/7 i artefakty 8 nie są wyposażeniem do slotu akcesorium.

Każdy z czterech bossów ma te same **dziewięć gwarantowanych pozycji**:

|  ID | Przedmiot                       | Liczba |
| --: | ------------------------------- | -----: |
|  45 | Great Healing Potion            |     10 |
|  47 | Scroll of Memorizing            |      5 |
| 169 | Hero's Necklace                 |      1 |
| 485 | Medium Mana Potion              |     10 |
| 673 | Crystal of Experience [Greater] |      1 |
| 723 | Moon Stone                      |      5 |
| 759 | Medal of Honor                  |      1 |
| 786 | Tool Aid                        |      5 |
| 972 | Lucky Scroll                    |      5 |

Każdy dodatkowo losuje **10 oddzielnych akcesoriów**, ID 1828..1837, po jednej sztuce.
Szansa **na każde**: Balrog 100/10000 (1%), Kamira 180/10000 (1,8%), Red Dragon
140/10000 (1,4%), Golden Dragon 200/10000 (2%). To nie jedna łączna szansa na
dowolne akcesorium. W jednym zabójstwie może wypaść więcej niż jedno.

Oprócz raidu są cztery próby zwykłej surowej tabeli `t_npc` (bez filtrowania klas,
bez dodatków IdleLC). Balrog ma 13 slotów sprzętu po 4%, pozostałe trzy bossy
nie mają zajętych zwykłych slotów w tym zrzucie. Pierwsze `-1` kończy tabelę.
Nie dodaje się ogólnego losowania Smelting Stone ani zwykłych losowych akcesoriów.

**Wyjątek właściciela wobec serwera:** poziom postaci i kolor nazwy bossa nie
blokują przedmiotów. Żadne bonusy do dropu, buffy, tytuły, eventy ani multiplikatory
nie zwiększają szans ani liczby przedmiotów. Dedykowane losowanie wykonuje się przed
losowaniem walut, dzięki czemu ich różna liczba losowań nie zmienia strumienia
przedmiotów. EXP/SP/Nas nadal używają istniejących reguł walki; gwarancja dotyczy
przedmiotów z powyższej tabeli. Nie są to gwarantowane dodatkowe waluty.

## Raid ACC i lupa

Przedmioty 1828..1837 trafiają jako osobne **nieodkryte** sztuki, bez losowych
zwykłych opcji. Appraiser i obie istniejące lupy obsługują je tak jak pozostały
rare sprzęt. Zwykła lupa zachowuje dotychczasowe 60% IdleLC, złota 100%.

Identyfikacja korzysta ze źródłowych zestawów `t_rareoption` 10..19 i ich
`a_option_prob`. Nie wymusza sześciu losowych opcji ani nie zmienia kolorów.
**Crest of Rainbow 1828 ma w źródle grade B (zielony)**; pozostałe dziewięć ma
grade A (niebieski). Przed identyfikacją nazwa pozostaje czerwona. Artefakt Seraphim
10953 ma inne przeznaczenie i nie dostaje flagi nieodkrytego wyposażenia.

Naprawiono też rozpoznanie naszyjników (`IACCESSORY_NECKLACE`, subtype 5), wymagane
dla Crest of Rainbow i gwarantowanego Hero's Necklace. Zwykłe naszyjniki otrzymują
zwykłe opcje akcesorium; rare naszyjnik czeka na lupę.

## Pliki i granice integracji

- `scripts/lc/world-boss.mjs`, `import-db.mjs`: źródłowe NPC, raidowe wiersze, rare ACC;
- `data/worldBosses.ts`, `logic/worldBoss.ts`: postęp, próba, niezależny drop;
- `GameService`/`LocalGameService`: komendy, walidacja raportów, atomowy zapis nagród;
- `state/gameStore.ts`: kolejka komend, usunięcie starego celu, trasy w obie strony;
- `ui/worldBoss/`: statyczne portrety modeli klienta i półokrąg;
- `GameCanvas`: teren placu przywołania przy zachowaniu zwykłej `location`;
- model Kamiry oraz obu smoków w `public/models/lc/`, nowe ikony z atlasów klienta;
- FX skilla Kamiry 390: dwie grupy, 13 efektów, sześć systemów cząsteczek i jedna
  tekstura, bez zmian wcześniejszych rekordów FX. Manifest `effects.json?v=5`.

Gra nadal ma **lokalny** serwis. `encounterId` i pojedynczy zapis chronią normalny
przebieg oraz ponowione komendy, nie stanowią zabezpieczenia zapisu przed jego
właścicielem. Przyszły backend musi sam naliczać widoczne zabójstwa, zużywać próby,
losować drop i atomowo wypłacać nagrody. Nie przenosić tego na niezaufany klient.

Testy `logic/worldBoss.test.ts` i `service/worldBoss.test.ts` sprawdzają źródłowe
szanse i ilości, niezależność od poziomu/bonusów, lupy i kolory, save v16, limity,
AFK/Dungeons, śmierć, reload i powtórzenie raportu. Regresja `combat.test.ts`
pilnuje, by pojedyncza próba nie tworzyła kolejnego bossa w tej samej klatce.

## Wyniki weryfikacji

- `npm run check`: **596 testów w 72 plikach**, lint, formatowanie i TypeScript.
- `npm run build`: poprawny build produkcyjny.
- Chromium, 320/390/1280 px: przycisk, gotowość, zniknięcie zwykłego celu, bieg,
  wszystkie cztery oryginalne modele, wypłata i powrót. Zmierzone trasy przykładowych
  zapisów: Juno 265,63 m, Dratan 481,78 m, Merac 1083,33 m, Egeha 292,19 m.
- Są to **próby na przygotowanych zapisach** blisko progu przywołania, z jednym
  rzeczywistym zabójstwem domykającym licznik Juno. Przyspieszenie i narzędzia dev
  służyły skróceniu testów walk i zapewnieniu zwycięstwa (dla Dratan/Merac/Egeha
  testowe HP oraz zakończenie celu komendą dev). To test integracji, **nie pomiar
  balansu ani naturalnej częstości dropu**. Szanse, ilości i brak wpływu buffów
  sprawdzają deterministyczne testy źródłowej tabeli.
- Osobna walka zakończona śmiercią przy Kamirze potwierdziła powrót oraz ponowne
  naliczanie zwykłych zabójstw, bez nagrody za bossa.
- Appraiser na 320 px: dwa nieodkryte raid ACC, zużycie dwóch złotych lup, źródłowe
  opcje i kolory B/A. Przyciski starcia mieszczą się wewnątrz ramki. Końcowe próby
  przeglądarkowe nie zgłosiły błędów JS, konsoli, HTTP ani żądań.
- Porównanie z `f5b95b9`: wcześniejsze NPC, skille, zestawy rare i modele pozostały
  bez zmian. Dodano NPC/skill Kamiry, 12 przedmiotów i tabelę raidów; istniejące
  przedmioty 1832/1835 dostały brakujące metadane rare. Dotychczasowe rekordy FX
  pozostały takie same, nowe są wyłącznie wpisy Kamiry i ich zależności.

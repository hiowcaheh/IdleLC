# Uzgodnione zasady i różnice względem oryginalnego LC

Najnowsze rozstrzygnięcie właściciela, 2026-11-04:
loader ma pokazywać całą ilustrację na całym ekranie bez przybliżania. Używamy
rozciągania `100% 100%`, z możliwą zmianą proporcji. Poprzednie `contain`
z rozmytymi marginesami jest wycofane. Usunięto też ikony SP na wyraźne polecenie
właściciela. D25 obejmuje wspólny pasek Book/EXP, układ nagród z mniejszym Claim,
warunkową źródłową zieloną ramkę skilli i osobne okno pomocy o szybkościach.
[Zakres oraz sprawdzenia](ui-merac-fixes.md). SaveVersion nadal **14**.

Aktualizacja po audycie `a35cfbb`: właściciel zezwolił na naprawy wszystkich
14 punktów. Obejmuje to zastąpienie medianowego balansu postaci źródłowymi
zasobami/kanałami, źródłowe szybkości i regenerację, ciągłą symulację AFK,
oryginalne tereny pozostałych dwóch map oraz zabezpieczenia zapisu/klawiatury.
P01–P13 pozostają: bezpieczne kamienie, limit +15, cztery mapy, poziom 100,
własne wyprawy i opcje czasowe. Brakujących danych nie wolno wymyślać.
Importer/algorytm przygotowany do pełnych danych nie oznacza ich odzyskania.
[Stan każdego punktu i pozostałe ograniczenia](audit-fixes.md).

Aktualizacja 2026-11-04 — osiem poprawek Book/Character/Skills/Shop:
`shopOffer` oferuje najlepszy istniejący wariant rare tej samej rodziny, ceny,
poziomu i bazowych parametrów, aby także zakupy pozwalały uzyskać sześć pieczęci
klasy A ze specjalnymi opcjami. Zachowano jeden wiersz rodziny, okno progów,
pule/szanse Appraisera, P03 i P04. Dotychczasowy wybór najsłabszego wariantu
w importerze nie jest już ofertą końcową. To jawna zmiana na życzenie właściciela;
nie zmienia posiadanych przedmiotów ani schematu zapisu. D25 obejmuje niezależny
scroll Book, poprawki SP/atrybutów/skilli i ramkę złota.
[Szczegóły i kontrola](book-shop-ui-fixes.md).

Stan rejestru: 2026-11-02, punkt odniesienia implementacji `c9944c9`. Celem jest oddzielenie naprawy błędnej interpretacji od zmiany projektu. Szczegóły oryginału i numery linii: [audyt źródeł](source-audit/README.md). Aktualne wdrożenie: [przekazanie prac](development-handoff.md) i changelog.

„Oryginał” w tym dokumencie oznacza odczytane źródła November 2018, z uwzględnieniem ich ograniczeń i flag. Nie potwierdzono, że każda reguła działała identycznie na serwerze prywatnego klienta 2015. Dla brakujących wartości DB nie wybieramy liczb na podstawie nazw.

## Rozstrzygnięcia właściciela — 2026-11-06, druga partia

- **Fale Dungeons:** dwa razy więcej potworów (`2 × (4 + fala)`). Następna fala 5 s po
  wyczyszczeniu (właściciel).
  - **Własne:** zachowany 30 s harmonogram jako najpóźniejszy start.
  - **Własne:** powtórka fali 20 do końca 600 s.
  - **Własne:** limit 16 żywych potworów naraz bez zmian (wydajność).
- **Mikstury w rundzie:** tap na slocie pije miksturę (jak szybkie sloty klienta w walce).
  **Własne:** przytrzymanie otwiera ustawienia. Poza Dungeons tap nadal otwiera ustawienia.
- **Ranking:** tylko top 3, z trofeum klienta (`trophy.tex`, Royal Rumble). Kolory srebra
  i brązu to **własny** filtr CSS, bo klient nie ma osobnych grafik.

## Rozstrzygnięcia właściciela — 2026-11-06, 12 zgłoszeń

- **Prędkość biegu bohatera:** maks. **20 m/s** (`MAX_RUN_SPEED`), sztywna reguła właściciela.
  Obowiązuje w walce, biegu między spotami, wyprawach i Dungeons. Potwory nie są ograniczane.
- **Buffy:** w jednej linii, maks. **50** widocznych naraz (właściciel).
- **Próg AUTO:** suwak 5–100% co 5% na slot (właściciel). Domyślne progi bez suwaka:
  50% HP i 30% MP, regeneracja przy niepełnym pasku. To nadal **własne** wartości.
- **Super Haste kontra Potion of Haste:** źródłowe `CAssistList::CanApply` (blokada przy
  wyższym poziomie tego samego `magic`) i `DelDuplicate`. To nie jest reguła własna.
- **Wyprawa z boostami:** symulacja odlicza czas boostów co tick (bez zmian reguł).
  Prognoza w oknie jest pomiarem odcinków pierwszej godziny, a nie pełną symulacją.

## Rozstrzygnięcia i własne reguły — 2026-11-06

Właściciel zatwierdził etapy techniczne (walka z serwera, brakujące skille, efekty klienta,
wydajność) oraz szybkie poprawki ([combat-skills-summons.md](combat-skills-summons.md)):

- **100 Cooldown Reduction Potion** zeruje cooldowny skilli (właściciel; w bazie STAT37 daje
  ok. 70%). Stałe cooldowny (`SF_GUILD`, `SCT_NO_COOL_TIME`) zostają.
- **100% Cast Potion (90001) wycofana**; zapisy dostają 50 000 złota za każdą sztukę.
- **Własne**: Charge na AUTO czeka, aż potwór przygotowuje skill; żywiołak bije co 2 s potwora
  bohatera i dobiega razem z nim (na serwerze ciosy żywiołaka wysyła klient); skill potwora na
  żywiołaku zadaje tylko obrażenia; nienawiść rośnie tylko od obrażeń (zrzut nie ma `a_hate`).
- Bity `a_sorcerer` (komu działa pasywna Sorcerera) pochodzą z `skills.lod` klienta 2015, bo zrzut
  2016 nie ma tej kolumny (`SORCERER_APPLY` w `summons.ts`).
- Resurrection i Invisibility pozostają niedostępne: bez drużyny i bez sensu w walce jeden na jeden.

## Rozstrzygnięcia właściciela — 2026-11-06/07 (Dungeons, trzecia partia)

Reguły właściciela, bez odpowiednika w źródle (szczegóły w
[owner-batch-2026-11-06.md](owner-batch-2026-11-06.md)):

- **Buffs:**
  - koszt ulepszenia to `100 × obecny poziom`;
  - z puli wypadają pierwsze stopnie Haste i Battle Roar, wchodzą Mana Recovery i Tyrant.
    Zamienniki wybrałem sam: to klasowe buffy z pełnymi danymi, których pula nie miała;
  - kupione poziomy usuniętych buffów wracają jednorazowo jako punkty, po 100 za poziom.
- **Ranking:** osobny dla każdego podziemia oraz łączny, po trzy miejsca.
- **Fale:** po wyczyszczeniu zawsze pełne 5 s; harmonogram 30 s działa tylko na falę, która walczy.
- **Ikona torby w rundzie:** Old Pouch (`t_item` 298).

Przybliżenia własne w efektach z klienta (brak danych w konwertowanych modelach):

- punkty grup broni (SWORD, sztylety, AXE) to końce trzymanej broni wzdłuż najdłuższej osi:
  `__1_` przy dłoni, `__0_` dalej;
- drugi punkt grupy pocisku leży 0,8 m za nim;
- pocisk leci po prostej do środka celu, z prędkością skilla ze `skills.lod`.

## Rozstrzygnięcia właściciela — 2026-11-05, wieczór

Właściciel: tytuły i mikstury mają działać „1:1 tak jak w plikach serwerowych”. Wdrożone
([owner-batch-2026-11-05-evening.md](owner-batch-2026-11-05-evening.md)):

- **D16 rozstrzygnięte według źródła**: 24/25 bez efektu, 55/66 jako procent wag critical/deadly
  (opis „+150%” jak w kliencie), na tytule 50 bez efektu, a 99 tylko wyświetlane; 101–106 działają.
  Ciosy potworów używają źródłowych typów ciosu (krytyk/śmiertelny tylko bossy i pół-bossy).
- **Wybór mapy** zawsze prowadzi na jej pierwszy spot (wcześniej: najdalszy otwarty).
- **Własne, do korekty cen później**: 100% Cast Potion (id 90001, brak w bazie) i ceny 50 000 dla
  Super Haste / 100 Cooldown / 100% Cast (w bazie cash itemy).

## Rozstrzygnięcia właściciela — 2026-11-05

Po sprawdzeniu [zrzutu bazy 2016](db-2016-dump.md) właściciel zatwierdził wszystkie cztery etapy
pełnego importu („Wprowadź wszystkie 4 po kolei”):

- **D08:** drop według źródła — cztery próby wśród pełnych 20 slotów (także pustych). Łupy z potworów
  spadają ok. 4–5× rzadziej niż przy losowaniu każdego wpisu; Smelting Stone i akcesoria bez zmian.
- **D01/D02/D04:** prawdziwe CON, magic avoid, ataki magiczne i skille potworów z bazy. Część
  potworów (zwłaszcza magicznych) jest wyraźnie groźniejsza; balans nie jest wyrównywany.
- **D24:** Dratan, Merac i Egeha — walka w punkcie spawnu potwora z `t_npc_regen`; Juno zostaje na
  własnych arenach. Bieg między spotami trwa tyle, ile wynika z Run speed i długości trasy po mapie
  (trasa omija drzewa, skały, budynki, urwiska i wodę; siatka z pliku atrybutów klienta `.sat`
  dla Dratan/Merac, z nachylenia i obiektów dla Juno/Egeha).

Wdrożone tego samego dnia na polecenie właściciela (szczegóły:
[spawns-routes-ranged-boosts.md](spawns-routes-ranged-boosts.md)):

- **Walka z dystansu**: zasięgi i dobieganie potwora według kodu serwera (bez własnych liczb).
- **Loader stref**: cały obrazek we własnych proporcjach zamiast `100% 100%` (właściciel: „oddal widok,
  jest przybliżony i rozmazany”).
- **Mikstury-wzmocnienia** (D20, do potwierdzenia): Haste i Adrenalina w sklepach z `t_shopitem`
  (ceny z bazy); „100% cast” zinterpretowano jako **100 Cooldown Reduction Potion** (w bazie brak
  mikstury STAT23), sprzedawaną wszędzie za **własne 50 000 gold** (w bazie cash item, cena 0).

## Rozstrzygnięcia właściciela — 2026-11-04

- **D09/D10:** polecenie obejmuje źródłowe różnice poziomu i losowanie nagród solo.
  EXP/SP mają niezależne ±10%, źródłowe procenty i minimum 1. Nas ma szansę 80%
  pomniejszaną o 5 pp za przewagę poziomu oraz ilość 50–150% bazy. Runtime rate
  jest neutralny; nie włączamy nieznanych eventów, premium ani party.
- **D08:** blokada od przewagi 6 poziomów dotyczy wszystkich aktualnych kill-dropów.
  Pełny algorytm czterech prób spośród 20 slotów pozostaje osobnym zakresem;
  dotychczasowe szanse Smelting Stone i akcesoriów są zachowane w dozwolonych killach.
- **D24/D25:** oryginalny teren i obiekty Dratan są wdrożone w obecnym modelu idle:
  42 własne, bezpieczne areny w kolejności spotów, obiekty w otoczeniu trasy.
  Nie zmienia to blokad miast ani zakresu czterech stref / poziomu 100.
- **D25:** źródłowe progi i paleta obejmują całe nazwy potworów; materiały Mist
  zachowują alfę, Full Bright i dokładne klipy 2015. To nie pełny port BAE.

Szczegóły i walidacja: [raport PvE i Dratan](pve-dratan-fixes.md). Nie ma migracji
zapisu ani odbierania wcześniejszych nagród; SaveVersion pozostaje 14.

## Dalsze rozstrzygnięcia właściciela — 17 zgłoszeń GUI i premii

- **D03 rozstrzygnięte:** plusy nadają wzrost ATK/DEF i premie +15 według źródeł.
  P01/P02 (kamienie, szanse, bezpieczna porażka i limit) są zachowane. Własny balans
  nieulepszonego sprzętu pozostaje; przyrost za ulepszenie jest dokładną liczbą
  źródłowego kanału, zamiast dodatkowego mnożenia przez adapter gear-reference.
- **D25:** kolejne okna używają oryginalnych zasobów, pasywne ikony mają okrągłe
  przycięcie, a informacje skilla są w osobnym modalu. Walk speed ukryto w UI.
- **Loader w tym etapie:** `contain` zastąpiło `cover`, z rozmytą kopią w tle.
  Późniejsze polecenie opisane na początku dokumentu zastępuje ten wariant
  rozciąganiem całej ilustracji do ekranu.

Szczegóły: [raport premii i GUI](client-ui-upgrade-fixes.md). SaveVersion pozostaje 14;
przeliczane są dane pochodne istniejących przedmiotów. Nie ma migracji ani kasowania plusów.

## Rozstrzygnięcia właściciela — 2026-11-03

Nowa lista 18 zgłoszeń precyzuje wcześniejsze decyzje:

- **P03 / D13:** zachowano 600 s i limit pięciu opcji, ale losowanie dotyczy wyłącznie
  zwykłej broni/zbroi o wymaganym poziomie poniżej 73. Akcesoria i rare są wyłączone.
  Dotychczasowych opcji nie usuwa się z przedmiotów.
- **P08:** zachowano jawny start i limit 8 h; usunięto minutową karencję licznika i wypłaty.
- **D01:** dodano ręczne rozdawanie atrybutów, po 1 punkcie za awans klasy bez profesji
  (`PC.cpp:1370–1379`). Trwały zapis wymaga wersji 14; migracja zachowuje stary zapis
  i nalicza zaległe punkty. Główne HP/ATK/DEF wciąż korzystają z adaptera balansu.
- **D24:** przejście do następnej krainy wymaga zabicia końcowego potwora poprzedniej
  w kolejności Juno, Dratan, Merac, Egeha. Spoty i osobne bossy pozostają jak wcześniej.
- **D25:** Cashshop jest wspólnym tłem podglądów modeli; Skills używa dodatkowych
  oryginalnych zasobów. Wysokość okien i czytelne etykiety są dostosowane do telefonu.

Zakres i weryfikacja: [raport 2026-11-03](fixes-2026-11-03.md). Poniższe tabele
zachowują historię decyzji; powyższe rozstrzygnięcia zastępują kolidujące wpisy.

## Zasady uzgodnione — zachować podczas napraw

| ID  | Reguła IdleLC                                                                                | Dowód ustalenia w repozytorium                                         | Skutek dla dalszej pracy                                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P01 | Bez zniszczenia przedmiotu podczas ulepszania; porażka obniża plus dopiero od +10; limit +15 | `src/game/logic/equipment.ts`, commit `3228a7a`, dziennik `CLAUDE.md`  | Nie przywracać oryginalnego destroy ani ryzyka od +3. Oryginalna szansa nie jest automatycznym wymaganiem projektu. |
| P02 | 10 Smelting Stones → 1 Heaven Stone                                                          | `equipment.ts`, kontrakt `GameService.exchangeStones`                  | Nie zmieniać automatycznie Smelting Stone na oryginalny osobny sposób ulepszania.                                   |
| P03 | Opcja na losowej założonej części po 600 s aktywnej gry                                      | `options.ts`, `OPTION_PLAY_SECONDS`, dziennik `CLAUDE.md`              | Nie usuwać na rzecz Blood Points/Blood Gem przy naprawie znaczenia opcji.                                           |
| P04 | Specjalne zestawy rare od poziomu 77 według slotu                                            | `scripts/lc/import-db.mjs`, `SPECIAL_RARE_LEVEL`, commit `da6f63e`     | Nie usuwać rozszerzenia jako „niezgodnego z bazą”; zachować przy reimportach.                                       |
| P05 | Juno, Dratan, Merac, Egeha; max poziom 100                                                   | `zones.ts`, `progression.ts`, commit `1358788`                         | Nie odblokowywać innych stref ani poziomów podczas konwersji ich plików.                                            |
| P06 | Sześć klas: Titan, Knight, Healer, Mage, Rogue, Sorcerer                                     | `classes.ts`, `CLAUDE.md`                                              | Brak Night Shadow i jego dropu jest decyzją, nie brakującą implementacją do automatycznego dopisania.               |
| P07 | AUTO i siedem pól paska skilli                                                               | `skills.ts`, UI paska, commit `6aec53a`, `CLAUDE.md`                   | Zachować wybór paska, wymagania sprzętu i automatyczne użycie.                                                      |
| P08 | Jawnie uruchamiana wyprawa AFK do 8 h, bez biernych nagród podczas zwykłego wyłączenia gry   | `afk.ts`, `GameService`, `CLAUDE.md`                                   | Oryginalne serwerowe „Expedition” to rajd; nie usuwać własnego AFK przy odtwarzaniu PvE.                            |
| P09 | Podwójne miecze zdejmują tarczę                                                              | `equipment.ts`, `CLAUDE.md`                                            | Podgląd porównania i faktyczne zakładanie muszą stosować tę samą regułę.                                            |
| P10 | Gra i nazwy UI po angielsku; dokumentacja dla właściciela po polsku                          | `CLAUDE.md`                                                            | Odzyskane etykiety nie zmieniają języka produktu.                                                                   |
| P11 | Stała wysokość okien z zakładkami                                                            | `.sheet--fixed`, commit `3228a7a`, `CLAUDE.md`                         | Nowe GUI ma pasować do tej zasady i telefonu.                                                                       |
| P12 | Frontend i zapis lokalny teraz; Supabase dopiero na końcu                                    | `service/index.ts`, `docs/supabase.md`, najnowsze zlecenie właściciela | Nie dodawać backendu, kont sieciowych ani zależności Supabase w tym etapie.                                         |
| P13 | Skonwertowane modele i dane w repozytorium; surowe materiały poza Git                        | `.gitignore`, `CLAUDE.md`                                              | Commitować spójne GLB/WebP/JSON, nie archiwa klientów, źródła C++ ani SQL.                                          |

Ten rejestr nie odbiera właścicielowi możliwości późniejszej zmiany zasad. Oznacza, że istniejącej decyzji nie trzeba ponownie uzyskiwać przy każdej naprawie technicznej.

## Potwierdzone błędne interpretacje — naprawiać po sprawdzeniu zależności

Poniższe punkty nie są propozycją balansu. Dotyczą znaczenia odczytywanych pól albo niespójności tego samego stanu między warstwami. Usunięcie błędu wymaga testu i kontroli aktywnej walki, AFK, UI oraz zapisu.

| ID  | Problem w punkcie odniesienia                                           | Potwierdzenie i warunek korekty                                                                                           |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| B01 | Pola materiału MESH mają błędną kolejność                               | Reader i writer `C/Engine/Ska/Mesh.cpp`; kontrolować osobno counts, flags, kolory i zero-based UV, nie samo EOF.          |
| B02 | Wyszukiwanie FRMC trafia w piksele FRMS                                 | Rzeczywisty `A/Data/Monster/Wyvern/wm.tex`; rozpoznawać sekcje od granic nagłówka.                                        |
| B03 | Wymuszone zamienniki modeli/animsetów pomijają czytelne oryginały       | `convert-lc.mjs`, `classes.mjs`; oryginał ma pierwszeństwo po poprawnym odczycie, fallback po rzeczywistym niepowodzeniu. |
| B04 | Zmiana opcji/identyfikacja założonej sztuki może nie odświeżyć fightera | `heroKey` uwzględniał UID i plus, pomijając opcje/rare; testować zmianę bez wymiany UID.                                  |
| B05 | CONFUSION/BLOOD mogą być interpretowane jako stun                       | `S/GameServer/Skill.h`, `Assist.cpp`; nie zamieniać w pełny nowy system CC bez implementacji danego stanu.                |
| B06 | MAXHP_450 interpretowane jako atak                                      | Enum `MT_STAT` i `ApplyAssistData`; właściwe HP z limitem wymaga zachowania kolejności bonusów.                           |
| B07 | SKILLSPD interpretowane jako szybkość zwykłego ataku                    | Źródłowe przygotowanie castu; nie mieszać z MAGICSPD/reuse ani ATTACKSPD.                                                 |
| B08 | DEADLY interpretowane jako critical damage multiplier                   | Oryginał ma osobną wagę trafienia deadly; potrzebny model typów trafień przed pełną korektą.                              |
| B09 | Wycinki loading wychodzą poza atlas                                     | Rzeczywiste rozmiary 16×16 i 64×32; wycięcie i sposób skalowania muszą być spójne.                                        |

Stan wdrożenia 2026-11-02: B01–B04, B06–B07 i B09 naprawiono i objęto testami;
B05 i B08 pozostają otwarte. STAT22 sumuje nieograniczone grupy przed limitami 450,
a STAT23 skraca przygotowanie castu. Szczegóły częściowego adaptera są w
[raporcie poprawek](fixes-2026-11-02.md).
Dodatkowo naprawiono MT_RECOVER: typ 2 przywraca procent maksymalnego HP/MP, typ 0 stałą ilość,
a typ 1 jest odrzucany. Usunięto też błędy cache PWA. Dowody w changelogu i dokumentacji przekazania.

## Różnice do przedstawienia właścicielowi punkt po punkcie

Każdy wpis pozostaje **otwarty** do czasu zapisania decyzji lub zakończenia wymaganego rozpoznania. To lista do późniejszej rozmowy, nie blokada rozpoczętego etapu odzyskiwania zasobów. Niektóre propozycje zależą od pełnego SQL i rozszerzenia modelu; samo „zmienić na oryginał” nie wystarczy do ich bezpiecznej implementacji.

Aktualizacja bieżącej partii: w D01/D02 dodano źródłowe atrybuty i punkty ratingów
z dwoma losowaniami; główne HP/ATK/DEF oraz jeden kanał walki pozostają adapterem.
W D10 działają już opcje EXP/SP 82/83; pełne reguły nagród nadal są otwarte.
W D16 opcja 63 jest już blokiem połowy zwykłego ciosu, natomiast legacy 55/66
i pozostałe wskazane różnice wymagają dalszego modelu. D25 ma częściowy adapter
ulepszeń z oryginalnymi modelami i ścieżkami; pełne efekty skilli/tytułów pozostają otwarte.
Poniższa tabela zachowuje historyczny punkt odniesienia tych decyzji.

| ID  | Obecne IdleLC / problem wyboru                                                                         | Odczytany oryginał lub brak danych                                                      | Decyzja do podjęcia                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| D01 | Statystyki klas i HP/MP skalowane do median potworów; docelowo ok. 8 trafień na zabicie i 30 na śmierć | STR/DEX/INT/CON, przyrosty klasy, profesja i własne kanały ataku/obrony                 | Zachować tempo IdleLC czy przejść na model klas źródła z osobnym balansem?                                     |
| D02 | Jedno attack/defense, uproszczone trafienie i crit                                                     | melee/range/magic, defense/resist, ratingi, sześć typów trafień, block                  | Jaki zakres pełnego modelu PvE wdrażamy i które statystyki pokazujemy graczowi?                                |
| D03 | Wzrost siły sprzętu liniowo +10% za plus, gear-reference ratio                                         | Wzrost wykładniczy i bonusy progowe; oddzielny wkład broni/postaci                      | Zachować siłę plusów czy przywrócić skalowanie oryginału przy zachowaniu bezpiecznego ulepszania P01?          |
| D04 | Prędkość NPC bezpośrednio z attackSpeed/10 i własny crit                                               | Interwał AI w pulse, dalszy tick AI, inne wagi hit types                                | Czy czas walki ma odpowiadać źródłu czy obecnemu tempu idle?                                                   |
| D05 | Wszystkie ataki skilli używają zbliżonego procentowego wzoru                                           | ONLYPOWER/ADDITION/RATE mają różne wykonanie                                            | Portować wszystkie rodziny mocy po odzyskaniu kompletu danych czy zachować wybrany balans?                     |
| D06 | Koszt zasobów przy rozpoczęciu castu; własny moment trafienia                                          | Koszty na FIRE, osobne READY/FIRE i kontrola warunków                                   | Jak traktujemy przerwane casty i synchronizację sceny? Pełne źródłowe wykonanie wymaga przeglądu całego cyklu. |
| D07 | Własna procentowa regeneracja i tick                                                                   | Źródłowa naturalna regeneracja co 3 s, zależna od klasy/stanu; assist co 1 s            | Zachować regenerację idle czy przenieść wartości i ograniczenia aktywności/siedzenia?                          |
| D08 | Zwykłe wpisy dropu losowane niezależnie                                                                | Cztery próby wyboru spośród pełnych 20 slotów, również pustych                          | Zmienić algorytm po odzyskaniu pełnych slotów czy zachować obecne tempo łupów?                                 |
| D09 | Złoto wypłacane jako wartość NPC                                                                       | Bazowo szansa 80%, ilość 50–150%, kary różnicy poziomów                                 | Zachować przewidywalny dochód idle czy oryginalne losowanie i kary?                                            |
| D10 | EXP/SP głównie z importowanych nagród                                                                  | Losowania i modyfikatory poziomów, partie grupowe, premie                               | Które modyfikatory solo mają działać w IdleLC? Wymaga uzgodnienia zgodności z tempem EXP.                      |
| D11 | Własne konsekwencje śmierci w symulacji                                                                | Oryginał ma straty EXP/SP i wiele wyjątków                                              | Czy w ogóle dodajemy oryginalne kary do gry idle? Nie nakładać ich automatycznie.                              |
| D12 | Rangi zwykłych opcji losowane bezpośrednio z wag DB                                                    | Generator skaluje współczynniki poziomem i liczbą opcji; podstawowy wynik level 1–3     | Zmienić losowanie przy zachowaniu automatycznej opcji P03?                                                     |
| D13 | Max pięć opcji na różnym sprzęcie                                                                      | Zwykły workflow Blood Gem ogranicza armor do 3, weapon do 5                             | Zachować limity IdleLC czy zmienić je bez przywracania Blood Points?                                           |
| D14 | Zestaw rare wybierany po normalizacji sumy wag                                                         | Stała skala 1..10000 i dalsze niezależne bity opcji                                     | Czy zachowujemy normalizację, czy odtwarzamy również brak trafienia zestawu?                                   |
| D15 | Zwykła lupa ma 60% powodzenia; ograniczony katalog                                                     | 30% z HOLY_WATER, w innym profilu 50%; inne lupy 100%                                   | Jaka szansa i oferta mają obowiązywać w IdleLC?                                                                |
| D16 | Opcje 24/25 jako MP/HP steal, 55 jako critChance, 66 jako critMultiplier, 63 jako dodge                | 24/25 NOT_USED w badanym źródle, 55/66 wagi critical/deadly, 63 block połowy damage     | Uzgodnić wersję danych i docelowy model przed zmianą istniejących przedmiotów.                                 |
| D17 | Twardy wymagany poziom dla każdego sprzętu                                                             | Zwykły sprzęt można nosić wcześniej z karą; rare/origin/artifact mają inne ograniczenia | Zachować prosty próg czy wdrożyć source penalty i rozróżnienie rodzajów?                                       |
| D18 | Akcesoria wypadają z własną szansą 0,5%; sklep ich nie sprzedaje                                       | Drop i generowanie zależą od źródłowej bazy i innych ścieżek                            | Zachować własną dystrybucję czy wskazać źródłowy sposób zdobywania?                                            |
| D19 | Auto-mikstury przy 50% HP / 30% MP                                                                     | To progi projektu, nie dowód działania oryginalnego klienta                             | Zachować progi, udostępnić konfigurację czy przyjąć inne wartości?                                             |
| D20 | Heaven Stone w każdym sklepie za 1000                                                                  | Tymczasowa reguła właściciela, nie pełne t_shop źródła                                  | Czy oferta i cena mają pozostać po zakończeniu testów?                                                         |
| D21 | Newbie/Rising Star i tytuły, część dostępna przez dev                                                  | Import 199 rekordów nie określa pełnego sposobu zdobywania                              | Jak zdobywamy tytuły i które eventowe rekordy udostępniamy?                                                    |
| D22 | Nagrody księgi 1/2/5/10 Heaven Stone za progi zabić                                                    | Własny system; miejsce na indywidualne MONSTER_REWARDS                                  | Zachować domyślne nagrody czy ustalić osobno dla potworów?                                                     |
| D23 | Bossy rajdowe i eventowe potwory ukryte; sześć klas bez Night Shadow                                   | Dane/źródła zawierają więcej zawartości                                                 | Osobno uzgodnić bossy i ewentualne rozszerzenia; nie odblokowywać podczas konwersji.                           |
| D24 | Spoty odblokowywane zabójstwami, swobodne przejście stref, własne areny Juno                           | Oryginalny otwarty świat i źródłowe spawny; DB Juno nie pasuje do tego terenu           | Zachować przebieg idle; czy i kiedy zmieniać pozycje walk i tereny innych stref?                               |
| D25 | Własne efekty, częściowo odzyskane ramki i czytelny font webowy                                        | Dostępne atlasy/bitmapy i częściowo zbadane Effect.dat                                  | Które elementy wymagają wiernego wyglądu LC, a które mają zachować czytelność telefonu?                        |

Dopisane 2026-11-07 (Claude Code, czwarta partia):

| ID  | Obecnie w IdleLC                                                                                                 | Źródło / oryginał                                            | Do decyzji właściciela                                   |
| --- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| D26 | Skrzynki podziemi (własne 95001–95003): 5% z potwora, 80% Smelting / 20% Heaven Stone                            | Własny system na prośbę właściciela; model i ikony z klienta | Szanse i zawartość („będziemy podkręcać”).               |
| D27 | Sklep Cash: ceny własne i tanie (1000 Cash = 1 €), bez kamieni i sprzętu, paczki ~1/3 taniej; Cash tylko z dev   | Katalog bazy ma droższe ceny i inne paczki                   | Skąd gracz bierze Cash; czy ceny zostają.                |
| D28 | Pięć buffów podziemi spoza klas o stałym poziomie (Ignition 2, Offensive/Defensive Howling 12, Moon Cake, Stars) | Dane 1:1, wybór i stały poziom własne                        | Czy Ignition +200% nie jest za mocny; Howling 12 czy 10. |

## Jak zapisywać rozstrzygnięcie

Przy decyzji dopisz datę, odpowiedź właściciela, zakres plików i status wdrożenia przy konkretnym ID. Jeżeli zmienia zapis lub istniejące przedmioty, opisz migrację oraz wpływ na aktywną walkę/AFK. Po wdrożeniu podaj commit i weryfikację. Nie usuwaj historii decyzji; nowa decyzja zastępuje wcześniejszą jawnie.

Punkty B05–B08 i D01–D17 mogą technicznie się łączyć, lecz nie są zgodą na jedną wielką przebudowę. Najpierw odtwórz mały, mierzalny problem, sprawdź brakujące dane, a potem wybierz najmniejszy spójny etap.

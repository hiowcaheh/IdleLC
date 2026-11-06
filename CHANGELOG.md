# Historia zmian

## 2026-11-06 (Claude Code): walka z serwera, brakujące skille, żywiołaki Sorcerera

Punkt wyjścia `445f599`. Commity `1cc02e0`, `6555b24`, `bfe732d`, `9708ca3`, `87cfbbf`, `d2ad688`,
`dd3564a`, `576f8c0`. Pełny opis: [docs/combat-skills-summons.md](docs/combat-skills-summons.md).

1. **Szybkie poprawki**: bez poświaty slotów mikstur, Equipment z listą „Worn”, 100 Cooldown
   Reduction Potion = skille od razu gotowe (własna reguła), 100% Cast Potion wycofana (zwrot
   50 000 złota za sztukę), Remove effect z potwierdzeniem i czerwonym komunikatem spadków.
2. **Walka jak na serwerze**: ciosy i tempo potworów (`GetDamage` NPC), kara za śmierć w walce
   i na wyprawie, koszt skilla przy wystrzale, żywioły (`nAttrTbl`).
3. **Skille**: Far Seeing, Combat Reflection, Charge, Veteran's Composure działają; Resurrection
   i Invisibility mają w oknie Skills powód, dla którego nie działają solo.
4. **Żywiołaki Sorcerera**: statystyki z `Elemental.cpp`, 20 min, przerwa 5 s, pary ogień/wiatr
   kontra ziemia/woda, nienawiść potwora i prowokacja, pasywne „Empowered” tylko na żywiołaka;
   modele klienta w scenie.

Weryfikacja: `npm run check` (**493 testy / 56 plików**), Chromium 390×844. SaveVersion **14**.

## 2026-11-05 wieczór (Claude Code): 15 zgłoszeń — tytuły 1:1, bieg, GUI, teren, dym

Punkt wyjścia `b1bbc0e`. Commity `4069ec7`, `d6a791a`, `abf96ad`, `baffd2a`, `c446eb9`, `2ebf847`,
`76cf06f`. Pełny opis: [docs/owner-batch-2026-11-05-evening.md](docs/owner-batch-2026-11-05-evening.md).

1. **Opcje tytułów i specjalne według serwera**: 342 → 855 Critical rating jest poprawne (+150%),
   poprawiony opis; 24/25 bez efektu; tytuł: 50 bez efektu, 99 tylko wyświetlane; 101–106 działają.
   Ciosy potworów mają źródłowe typy (krytyk tylko u bossów), co pozwala działać Toughness.
2. **Bieg**: licznik czasu, wyprawa zablokowana w biegu (a gdyby ruszyła, to ze spotu startowego),
   nowa mapa zawsze od pierwszego spotu.
3. **Teren**: maski warstw wszystkich map naprawione (kreski i kwadraty na ziemi), `MAP_REVISION`.
4. **Mikstury**: Super Haste (1 h), własna 100% Cast Potion, Adrenalina wszędzie; okno mikstury
   w wierszach; dym pod stopami przy wzmocnieniu biegu jak w kliencie; Remove effect dla buffów.
5. **GUI**: porównanie „If you wear it” zielone/czerwone z Wear pod spodem, Settings bez nadmiaru
   linii, slot mikstury tylko z AUTO, Equipment wtopione w okno, efekty na ekranie wyboru postaci.

Weryfikacja: `npm run check` (**464 testy / 53 pliki**), Chromium 390×844. SaveVersion **14**.

## 2026-11-05 (Claude Code): spawny i trasy, walka z dystansu, wzmocnienia, partia GUI

Punkt wyjścia `0be9812`. Commity `63377de`, `9dd82c1`, `3a29b80`, `bf73c70`, `4ab0d3a`, `67671a3`.
Pełny opis: [docs/spawns-routes-ranged-boosts.md](docs/spawns-routes-ranged-boosts.md).

1. **Zrzut bazy 2016 — wszystkie 4 etapy** (decyzja właściciela): `lc-data.json` z pełnego importu
   (spawny, `hitrate`, drop według 20 slotów ~4–5× rzadszy, CON/magic avoid/ataki i skille NPC).
2. **Dratan, Merac, Egeha**: walka w punkcie spawnu potwora z `t_npc_regen`; Juno bez zmian.
3. **Bieg między spotami** trwa tyle, ile trasa po mapie przy Run speed (A* po `nav.bin` z pliku
   atrybutów klienta albo nachylenia/obiektów/rzeki); trasa omija wodę, drzewa, skały i urwiska.
4. **Walka z dystansu**: Healer (20 m), Mage (15 m), Rogue z kuszą (15 m) strzelają od razu, potwór
   dobiega z prędkością z bazy; zasięgi z kodu serwera (+2 m dla broni dystansowych/magicznych od +8).
5. **GUI**: jeden X w Skills, pole AUTO i podświetlenie mikstury w slocie, Settings na elementach
   okna opcji klienta, loader stref w proporcjach obrazka, mała wspólna ramka złota, Gold na całą
   szerokość w Expedition, „Loading IdleLC”.
6. **Mikstury**: Potion of Haste, Platinum Adrenaline i 100 Cooldown Reduction Potion z efektami,
   czasem i flagami z bazy; stan zapisywany (`boosts`). W bazie nie ma mikstury szybkości rzucania.
7. **Komunikaty** po zakładaniu/zdejmowaniu, ulepszaniu, tytułach i miksturach pokazują zmiany
   statystyk na zielono/czerwono.

Weryfikacja: `npm run check` (**453 testy / 52 pliki**), Chromium 390×844. SaveVersion **14**.

## 2026-11-05 (Claude Code): sześć poprawek GUI i sprawdzenie zrzutu bazy 2016

Punkt wyjścia `fd6e1ee`. Commity `45eb188`, `da0ebd7` oraz dokumentacja.

1. **Book:** próg zabójstw, nagrody i Claim w jednym wierszu (kolumny Kills / Rewards / Status),
   mniejszy Claim; nic na siebie nie nachodzi.
2. **Inventory:** wszystkie sześć zakładek klienta w jednej linii także na telefonie (mniejsze rogi
   grafiki i tekst; od 600 px poprzedni rozmiar).
3. **Character:** pasek EXP w nagłówku nie ma już jaśniejszego prostokąta — wycinek `book-progress`
   gubi półprzezroczystą obwódkę z atlasu (`ui.mjs`, opcja `minAlpha`), adres z `?v=` dla cache PWA.
4. **Character → Equipment:** usunięty napis „Tap a piece to see it”; plansza sprzętu zajmuje pełną
   wewnętrzną szerokość okna i jest niżej (ta sama grafika i ikony, bez dodatkowego skalowania ikon).
   Komunikat o pustym slocie zostaje, gdy gracz go wybierze.
5. **Skills:** pasywny skill do nauczenia ma ten sam zielony kolor i poświatę co aktywny (okrągły
   pierścień nad ikoną, więc szary filtr nienauczonego skilla go nie przygasza).
6. **Expedition:** okno w ramce klienta (pasek tytułu, X), sekcje jak w Character, pola wartości
   (Kills, Deaths, EXP, SP, Gold na godzinę), lista mikstur z ikonami (slot, ilość w torbie, zużycie
   na godzinę, na jak długo starczy / AUTO off / brak w torbie) oraz przyciski klienta Cancel i Send.

**Zrzut bazy 2016** (Drive właściciela): to ten sam `newproject_data.sql`, z którego zrobiono pierwszy
import — tylko starszy importer pomijał część kolumn. Zawiera `t_npc_regen` (spawny pasują 1:1 do
terenu Dratan, Merac i Egeha; Juno nie), `hitrate` skilli oraz CON/hit/dodge/magic avoid, 20 slotów
dropu i skille potworów. **Nie zaimportowano go do gry**: pełny import zmienia balans (łupy ok. 4–5×
rzadziej, część potworów wyraźnie groźniejsza). Pomiary i proponowane etapy:
[docs/db-2016-dump.md](docs/db-2016-dump.md).

Weryfikacja: `npm run check` (**435 testów / 49 plików**), zrzuty Chromium 390×844 każdego okna.
SaveVersion **14**, bez zmian zapisu i reguł gry.

## 2026-11-05: płynne podbieganie do kolejnego potwora

- Pozycja i obrót postaci podczas podbiegania aktualizują się w każdej klatce.
  Wcześniej oba elementy przeskakiwały w krokach logiki co 50 ms.
- Rysowanie pozycji uwzględnia niewykorzystany ułamek czasu; logika walki,
  czas dojścia zależny od Run speed i oryginalne tempo klipu biegu są zachowane.
- Uwzględniono stun, stone, hold, ukrytą kartę i zaległy czas symulacji.
- Zbadano ruch sześciu klas i oddzielnie pełną scenę produkcyjną.

[Pomiary i walidacja](docs/approach-motion-fix.md). SaveVersion **14**.

## 2026-11-05: bieganie, zakładki Inventory i przyciski

[Zakres, pomiary i ograniczenia](docs/running-inventory-fixes.md).

- Otoczenie mapy korzysta z indeksu przestrzennego i aktualizuje tylko zmienione
  modele oraz używane fragmenty buforów. Zachowano zasięg, obiekty i ich kolejność.
- W próbach Juno/Merac ilość danych buforów na odświeżenie spadła o 93–97%.
  To pomiar obciążenia renderera, bez deklarowania wzrostu FPS na telefonie.
- Inventory ma oryginalne grafiki zakładek: dwa rzędy na telefonie, jeden na desktopie.
- Przyciski zakupu, sprzedaży i nauki skilli pokazują tekst oraz koszt bez kropki.
- Sprawdzono pliki spawnów: dokładne współrzędne wymagają brakującej tabeli
  `t_npc_regen`. Rozmieszczenie potworów pozostaje bez zmian do otrzymania danych.

SaveVersion **14**, bez zmiany mechaniki, szybkości biegu i zapisu postaci.

## 2026-11-04: loader, Merac i osiem zgłoszeń GUI

Punkt wyjścia `c744b39`. [Zakres i sprawdzenia](docs/ui-merac-fixes.md).

- Merac zachowuje oryginalny teren, obiekty i 23 spoty z poprzedniej aktualizacji.
- Loader wypełnia cały ekran całą ilustracją, bez przycinania, przybliżania
  ani rozmytych marginesów; proporcje obrazu dostosowują się do ekranu.
- Nagrody Book mają oddzielny wiersz z ikonami i ilościami oraz mniejszy Claim.
- Character używa tego samego oryginalnego paska postępu co Monster Book.
- Zielona ramka aktywnych i pasywnych skilli pojawia się tylko przy możliwości nauki.
- „How speeds work” jest po prawej i otwiera osobne okno z GUI klienta.
- SP pozostaje widoczne jako liczba, bez ikon w Character i Skills.
- Usunięto długie myślniki z opisów, etykiet dostępności i metadanych aplikacji.

SaveVersion **14**, bez przeliczania postaci i przedmiotów.

## 2026-11-04 — naprawy po audycie: zapis, czas, walka, AFK i mapy

Punkt wyjścia `a35cfbb`. [Stan wszystkich 14 punktów, źródła i ograniczenia](docs/audit-fixes.md).

- Jedna aktywna karta i odrzucanie starego zapisu; druga karta wznawia aktualne konto.
- Stałe kroki logiki z zachowaniem czasu przy niskim FPS, bez automatycznych nagród z tła.
- Źródłowe HP/MP i wspólne kanały arkusza/walki; INT laski i DEX łuku mają właściwy wpływ.
- AFK symuluje skończone mikstury i ważność tytułu w czasie zabójstw.
- Rozdzielone stany, DOT pozostawiający 1 HP, MP_CANCEL Tyranta i Cure Poison.
- Źródłowe attack speed, cooldown bez limitu 50% i naturalna regeneracja co 3 s.
- Merac i Egeha mają oryginalne tereny oraz otoczenie WLD.
- Wszystkie okna utrzymują fokus klawiatury i oddają go po zamknięciu.
- Importer zachowuje brakujące wcześniej pola; dodano ścisły odzysk profili FX.
  Nie są to odzyskane dane SQL ani ukończony renderer. Nauka niekompletnych skilli
  jest blokowana, bez kasowania zapisanych poziomów. Summony, pełne FX oraz część
  hit/drop/Deadly pozostają do ukończenia; raport wymienia je jawnie.

SaveVersion **14**. Wyniki sprawdzeń: [plik walidacji](docs/audit-fixes-validation.json).

## 2026-11-04 — osiem poprawek Book, postaci, skilli i sklepu

Punkt wyjścia: `b0f10ab`. [Zakres i walidacja](docs/book-shop-ui-fixes.md).

1. Lista potworów i informacje w Book przewijają się niezależnie, również
   dotykiem nad podglądem 3D. Licznik jest na pasku postępu, prezenty są mniejsze.
2. Pola sum atrybutów są równe i symetrycznie ustawione; plusy pozostają obok.
3. Character i Skills mają wspólną pełną ikonę SP bez rozciągania grafiki.
4. Bieżący i następny poziom w modalu skilla mają odstępy od obu krawędzi.
5. `Mastered` jest pod nazwą w liście i w nagłówku szczegółów, bez powtórki na dole.
6. Usunięto dwie ciemne kreski z dolnej części ramki Book.
7. Ilość posiadanego złota w Shop ma oryginalną ramkę pola wartości.
8. Sklep oferuje najlepsze dostępne źródłowe warianty rare w tej samej rodzinie,
   cenie i poziomie. Po odkryciu można uzyskać niebieską klasę A i sześć opcji,
   m.in. casting/unik na hełmie, silence/stone na klatce i spodniach, bieg na butach,
   zgodnie z pulą przedmiotu. Oferta pokazuje liczbę pieczęci i możliwą klasę.
   Wynik nadal jest losowy; posiadane sztuki nie są zmieniane.

Weryfikacja: **389 testów / 43 pliki**, lint, formatowanie, TypeScript i build.
Chromium: trzy rozmiary okna, niezależny scroll myszy i dotyku, audyt 687 wpisów
progów oraz 39 zakupów/identyfikacji w serwisie na rzeczywistych danych LC.
Pełny build: zakup i odkrycie sprzętu przez GUI oraz zapis po odświeżeniu przeszły.
SaveVersion pozostaje **14**.

## 2026-11-04 — poziomy potworów, losowe nagrody i Dratan

Punkt wyjścia: `bf61f0f`. [Reguły, źródła i walidacja](docs/pve-dratan-fixes.md).

1. Całe nazwy potworów mają źródłowe kolory i progi różnicy poziomu: czerwony,
   żółty, biały, zielony, niebieski. Kary EXP/SP, blokada przedmiotów od przewagi
   6 poziomów i malejąca szansa złota działają w serwisie, aktywnej walce i AFK.
   Zachowano źródłowe minimum EXP/SP; niebieskie potwory nadal dają 10% bazowego EXP.
2. Mist i Poison Mist oraz ich elitarne warianty zachowują miękką przezroczystość,
   źródłową alfę i Full Bright. Przeliczono oba modele; szare prostokąty nie są
   rysowane jako nieprzezroczyste powierzchnie. Naprawiono też nazwę drugiego ataku.
3. Dratan ma oryginalny teren 3072×3072 m, 11 warstw, obiekty z WLD i 42 miejsca
   walki. Konwersję można odtwarzać osobno przez `--only terrain --map dratan`.
4. Każde zabójstwo niezależnie losuje EXP/SP ±10%, szansę złota i jego ilość
   50–150% bazy. Awans w środku rozliczenia zmienia następne nagrody. Estymacje
   pokazują wartości oczekiwane, Book podpisuje bazy, a feed zachowuje precyzję SP.

Weryfikacja: **385 testów / 43 pliki**, lint, formatowanie, TypeScript, build
i weryfikator zasobów przeszły. Chromium: osiem widoków sceny, osiem podglądów Book,
pięć kolorów, tryb z cieniami i przejście mapy — bez błędów strony, konsoli i zasobów.
180 raportów na rzeczywistych danych LC potwierdziło losowanie, kary i zapis.
Kaflowanie terenu zmniejszyło rysowany kadr z ok. 534 tys. do 40–67 tys. trójkątów.

## 2026-11-03 — źródłowe premie ulepszeń i dopracowanie GUI (17 zgłoszeń)

Punkt wyjścia: `fa66c0e`. [Wzory, zasoby i walidacja](docs/client-ui-upgrade-fixes.md).

1. Ulepszenia ATK/DEF używają źródłowej potęgi 1,06 do +10 i 1,07 powyżej +10,
   obcięcia części ułamkowej oraz płaskich premii progowych, w tym +15.
   Szanse, kamienie, wymiana, porażki i limit +15 pozostają takie jak dotąd.
2. Walk speed jest ukryte w Character; źródłowe pole pozostaje w obliczeniach.
3. Gotową nagrodę Book oznacza oryginalny prezent z Cashshop zamiast „!”.
4. Book ma źródłowe ramki, zakładki, listy, papier nagród i pasek postępu.
5. Usunięto powtórzony poziom spod ikon skilli; poziom jest w opisie obok.
6. Ikony pasywne są faktycznie okrągłe, łącznie z przycięciem samego obrazka.
7. Kliknięcie umiejętności otwiera osobny modal w ramce klienta.
8. Character ma źródłowe zakładki, nagłówki sekcji i ikonę SP.
9. Plusy atrybutów są mniejsze, z atlasu klienta, i znajdują się poza polem sumy.
10. Attack interval pokazuje końcowy odstęp i zmianę z jednostką „s”. Cast time
    adjustment i Cooldown adjustment zastępują niejasne „Normal” / „reuse time”.
    Dodano rozwijane objaśnienia sekund i procentów; modal pokazuje bieżące czasy
    skilla, z wartością bazową, gdy bonusy je zmieniają.
11. Appraiser korzysta ze źródłowych zakładek i formatowania wierszy klienta.
12. Shop korzysta z tych samych zakładek oraz uporządkowanych nagłówków i list.
13. Goods są grupowane po działaniu i rosnącej mocy: HP, MP, regeneracja HP/MP,
    kamienie i lupy. Great Mana Potion jest bezpośrednio po Medium Mana Potion.
14. Settings ma ramkę NewOption, sekcje, źródłowe przyciski wyboru i prostsze kontrolki.
15. Cała ilustracja ładowania mieści się przez `contain`, bez zoomu i przycinania.
    Osobne rozmyte tło wypełnia przestrzeń na pionowym ekranie.
16. Pod statystykami przedmiotu +15 są osobne źródłowe podpisy, np.
    `Attack Power +75`, `Defense power +100`, `Magic Defense power +50`.
17. Modal skilla zawiera źródłowy opis, typ i cel, wymagania poziomu/SP/sprzętu
    i wcześniejszych skilli, bieżący oraz następny poziom, efekty, koszt HP/MP,
    czas przygotowania, odnowienia i trwania oraz akcje nauki/AUTO/paska.

Weryfikacja: `npm run check` (**350 testów / 40 plików**), build i weryfikator
odzyskanych zasobów przeszły. Produkcyjny build sprawdzono w Chromium przy
320×740, 390×844 i 1280×900, wraz z dwoma przejściami map. Brak błędów strony,
konsoli i żądań zasobów; bez poziomego przepełnienia okien.

## 2026-11-03 — ekspedycje, rozwój postaci i GUI (18 zgłoszeń)

Punkt wyjścia: `58f51ae`. Szczegóły zasad, źródeł i walidacji:
[raport wdrożenia](docs/fixes-2026-11-03.md).

1. Ekspedycja nalicza czas od pierwszej pełnej sekundy. Podgląd zabić, EXP i złota
   nie czeka na upływ minuty; powrót przed minutą również rozlicza polowanie.
2. Ceny lup w Appraiser są w osobnym wierszu pod szansą działania.
3. Przyciski okna zakupu znajdują się przy dolnej krawędzi, poniżej podsumowania.
4. Wszystkie kwoty i ceny, także komunikaty sprzedaży, używają ikony złota.
5. Kolory kwot są zgodne z progami klienta: biały / cyjan / zielony / żółty / złoty.
6. Appraiser ma zaznaczanie wszystkich odkrytych przedmiotów i potwierdzenie przed
   sprzedażą; anulowanie zachowuje zaznaczenie oraz przedmioty.
7. W oknie Titles nickname jest nad tytułem; oba mają źródłowe ramki NamePopup.
8. Kolejna kraina wymaga zabicia ostatniego potwora poprzedniej: Juno → Dratan →
   Merac → Egeha. Warunek sprawdzają GUI, store i serwis.
9. Lista potworów w Book oznacza gotową do odebrania nagrodę znakiem „!”.
10. Podglądy potworów i postaci mają wspólne oryginalne tło przymierzalni Cashshop.
11. Skills korzysta z odzyskanej ramki, tła, zakładek, pola SP oraz osobnych opraw
    aktywnych/pasywnych umiejętności z `skill_new.tex`.
12. Opcja za czas gry trafia wyłącznie na zwykłą broń/zbroję poniżej poziomu 73.
    Akcesoria i wszystkie przedmioty rare są wyłączone z tego mechanizmu.
13. Attributes ma plusy i licznik pozostałych punktów. Każdy awans daje 1 punkt,
    także na wyprawie. Rozdanie zmienia bieżące statystyki i zapisuje się trwale.
    Migracja 13 → 14 zachowuje postępy; dotychczasowe poziomy dają należną pulę.
14. Kamera zachowuje dystans przy zniknięciu potwora; zmiana rozmiaru celu nie
    uruchamia animowanego zoomu. Loader odsłania mapę po podróży i ustaleniu kadru.
15. Po wejściu na mapę jej nazwa pojawia się przez chwilę na górze ekranu.
16. Kolejność górnych ikon: Settings → Titles → Skills → Inventory → Character.
17. Rzeczywista prędkość biegu skraca podróż między spotami i dobieg do potwora.
18. Combat bonuses zawiera osobne Stun / Stone / Silence resistance, z opcji
    61 / 60 / 62 i źródłowym limitem 80%.

Weryfikacja: `npm run check` (**337 testów / 39 plików**), build i weryfikator
odzyskanych zasobów przeszły. Chromium: GUI mobilne/desktop, rzeczywiste modele
Book, cztery przejścia map, nazwy po wejściu i reduced motion — poprawne, bez błędów
strony, konsoli i zasobów. Migracja v13 i rozdawanie punktów mają osobne testy.

## Dalsza korekta po testach na telefonie

Punkt wyjścia: `729a8b8`. [Raport źródłowy i walidacja](docs/source-followup-fixes.md).

- Loader map ponownie wypełnia ekran przez `cover`, bez pionowych czarnych pasów
  i animowanego zoomu. Zachowano dekodowanie, pasek szerokości i reduced motion.
- Character ma oddzielone atrybuty, zasoby, walkę, bonusy, szybkości i regenerację.
  Dodano osobne źródłowe physical/magic attack, defense, hit i evasion,
  critical/deadly rating oraz run/walk m/s. Główne pola bojowe nadal mają adapter balansu.
- Pierścienie ulepszeń używają rzeczywistych tagów, poprawnych nazw kości GLTF i
  źródłowych macierzy BS; łuk ma pierścień przy dłoni, podwójne miecze przy obu.
  Nieznane tagi nie spadają już do podstawy postaci.
- Wróżka korzysta z `CENTER` i źródłowej ścieżki przy głowie/ramieniu; kadr podglądu
  obejmuje cały efekt także u wysokich klas.
- Tytuły `eff_name*`, w tym najwyższy poziom sześciu klas, mają trzy źródłowe warstwy
  dymu zamiast podłogowego pierścienia i gwiazd. Odzyskano 12 grup, 36 emiterów
  i pięć tekstur; osiem innych rodzin efektów pozostaje nieobsługiwanych.
- `npm run check`: **317 testów / 37 plików**; build i weryfikacja zasobów poprawne.
  Sprawdzono rzeczywiste pozycje efektów sześciu klas, wysoki łuk i dual swords,
  układ mobilny/desktop oraz 28 wariantów loadera i cztery przejścia produkcyjnego buildu.
  Końcowe testy przeglądarkowe bez błędów strony, konsoli i zasobów.

## 2026-11-02 — etap 4: statystyki, opcje i efekty ulepszenia

Partię odtworzono od `461e964` po utracie niewysłanych plików. Źródła i ograniczenia
zgodności, przykłady liczbowe oraz wyniki kontroli opisuje [raport poprawek](docs/fixes-2026-11-02.md).

- Hitrate i evasion są punktami, z bazami/przyrostami klas i dwoma niezależnymi
  losowaniami całkowitymi. Knight 20 ma 168 punktów, opcja +75 daje 243.
- Dodano cztery źródłowe atrybuty i współczynniki bonusów HP/MP, opcje 67–80 i AllStats 99.
  Sprzęt i tytuł są liczone razem, bez mnożenia ich procentów. Newbie daje właściwe
  +10% bazowych HP/MP klasy; wygasłe tytuły tracą premie także podczas bieżącej walki.
- Opcje EXP/SP 82/83 działają w aktywnych nagrodach, wyprawie i estymacji godzinowej.
  STAT22 zwiększa maxHP z osobnymi limitami 450 po zsumowaniu grup; STAT23 zmienia
  przygotowanie castu, STAT8 odnowienie. Opcja 63 dzieli zwykły cios przez dwa.
- Bonusy ruchu mnożą prędkość. Porównanie podwójnych mieczy odejmuje również tarczę;
  Expedition zwalnia stan `busy` także po błędzie.
- Efekty broni i czterech części pancerza mają osobne progi 4/6/8/10/12/15.
  Dodano importer 108 grup ulepszeń z `Effect.dat`, oryginalną wróżkę i pięć pierścieni,
  ścieżki i tagi dłoni. Poświata śledzi geometrię broni. Poprawiono jasność/alfa Add,
  odróżniono Translucent i zachowano dwustronne powierzchnie modeli.
- Przejścia czterech map dekodują obrazy przed animacją, pokazują je w całości przez
  `contain`, używają szerokości paska i respektują reduced motion.
- Główne HP/ATK/DEF, pojedynczy kanał ratingów, critical/deadly oraz część renderera FX
  nadal są adapterami. Nie dodano backendu ani migracji; SaveVersion pozostaje 13,
  a zasady ulepszania, sześć klas, cztery strefy i AFK są zachowane.

Weryfikacja tej partii: `npm run check` (**301 testów / 33 pliki**), build i weryfikator
odzyskanych zasobów przeszły. Chromium: 18 kombinacji klas/ulepszeń, 28 kontroli map,
cztery rzeczywiste przejścia oraz Character/Newbie na buildzie produkcyjnym — poprawne,
bez błędów strony, konsoli i zasobów. Szczegóły oraz ograniczenia w raporcie powyżej.

## 2026-11-02 — etap 1: odzyskane zasoby klienta

Punkt wyjścia: `c9944c9`. Partia pochodzi z jawnego archiwum klienta 2015; formaty potwierdzono
kodem klienta z listopada 2018. Surowe archiwa i źródła C++ pozostają poza repozytorium.
Pochodzenie oraz ograniczenia zgodności opisuje [audyt źródeł](docs/source-audit/README.md).

- Poprawiono MESH17: kolejność parametrów materiału, flagi i indeksy UV. Kolor materiału jest
  odczytywany z parametru koloru zamiast z flag shadera. Czytnik kontroluje granice danych.
- Poprawiono TEX: sekwencyjne nagłówki zamiast wyszukiwania FRMC w pikselach; DXT3 rozróżniane
  od DXT5; starsze piksele RGB5551/RGBA4444. Skan odczytał 12493 siatki MESH17 do EOF i 11798 tekstur.
- Dodano odtwarzalną partię `scripts/lc/batches/recovery-2015.json`, `--batch` i `--strict`.
  Wywołania tylko dla ikon/UI nie nadpisują już mapowania animacji skilli.
- Wygenerowano 283 modele sprzętu: 258 z właściwymi teksturami zamiast jednolitego koloru,
  19 oryginałów zamiast zastępstw oraz sześć rękawic Cube Explorer.
  `lc-gear.json` obejmuje wszystkie 1158 grup źródłowych bez zastępczych modeli.
- Dodano Elder Drake; przywrócono oryginalny Cursed Weaver (z mieczem) i Cursed Lich.
  Odczytywalne oryginały mają pierwszeństwo; dawne zamienniki pozostają awaryjne.
- Odświeżono sześć modeli klas z ich kanonicznymi animsetami. Zastąpiono heurystykę `skills.lod`
  pełnym czytnikiem 1787 rekordów z checksum i EOF; poprawiono m.in. fazy Mage.
  Manifest ma 75 dokładnych mapowań z 2015 i cztery zachowane starsze wpisy.
- Uzupełniono mapowania ikon do 2052/2052 przedmiotów i 119/119 umiejętności; pięć komórek
  źródłowych jest szarymi placeholderami, a nie odzyskanymi ilustracjami.
- Wycięto właściwą ikonę Titles z ActionBtn0 (akcja 49), ramki NamePopup oraz poprawne paski
  ładowania; wszystkie 33 wycinki GUI mieszczą się w atlasach. Zintegrowano ramki i paski w UI.
- Naprawiono cache PWA: kasowanie tylko cache IdleLC, oczekiwanie na zapis odświeżonej odpowiedzi,
  tolerowanie braku miejsca oraz zachowywanie starszych chunków w obrębie wersji cache.
  Cache podniesiono do `idlelc-v2`; zapisy postaci pozostają w localStorage.
- Dodano [przekazanie dla Claude Code](docs/development-handoff.md), szczegółowe raporty,
  [rejestr decyzji i 25 różnic do późniejszego uzgodnienia](docs/design-decisions.md),
  narzędzie `npm run verify-lc-recovery` i [wynik kontroli GLB](docs/source-audit/recovery-validation.json).
  Historyczny dziennik CLAUDE jest wyraźnie oddzielony od aktualnego stanu.

## 2026-11-02 — etap 2: spójność statystyk i pierwsza korekta z serwera

- `heroKey` uwzględnia ID przedmiotu, rare i opcje założonego sprzętu. Identyfikacja noszonej sztuki
  oraz nowa opcja odświeżają fightera i estymację AFK bez wymiany UID. Zwykły łup nie resetuje walki.
- MT_RECOVER rozróżnia stałą ilość HP/MP (ONLYPOWER) i procent aktualnego maksimum (RATE),
  zaokrąglany w dół i ograniczony pojemnością zasobu. ADDITION jest odrzucane, zgodnie z
  `GameServer/Skill.cpp:1840,1906`. Opisy UI pokazują prawidłowe jednostki.
  Wszystkie 27 takich efektów w aktualnym eksporcie jest stałe — ich wartości pozostają takie same.
- Nie zmieniono bezpiecznego ulepszania, limitu +15, automatycznych opcji, rzadkich zestawów,
  czterech stref, limitu 100 ani działania wypraw. Nie dodano backendu ani Supabase; saveVersion nadal 13.

## 2026-11-02 — etap 3: roślinność Juno bez wymiany istniejących zasobów

- Dodano `npm run recover-lc-props`: dołącza wyłącznie brakujące modele i instancje,
  korzystając z obecnych aren. Przed zapisem sprawdza zgodność wcześniejszych rozmieszczeń;
  ponowne uruchomienie jest no-op.
- Juno ma 56 zamiast 41 modeli props i 5151 zamiast 963 instancji (+4188). Plik GLB rośnie
  z 969508 do 1185424 bajtów. Dotychczasowe geometrie, indeksy, transformacje, materiały i obrazy
  są identyczne po odczycie wynikowego pliku. Teren, maski, wysokości i 38 aren pozostały bez zmian.
- Nie zastąpiono różniących się tekstur drzew/budynków wersjami z 2015. Koszt nowych propsów
  oszacowano maksymalnie na +15 draw calls i +23477 trójkątów w promieniu 120 m na arenę;
  nie jest to pomiar FPS fizycznego telefonu.

### Weryfikacja pakietu

- `npm run check`: lint, Prettier, TypeScript, **271 testów w 31 plikach** — poprawne.
- `npm run build` i `npm run verify-lc-recovery` — poprawne. Odczytano wszystkie 292 GLB,
  sprawdzono skończone wartości accessorów, kości sprzętu, komplet mapowań oraz hashe manifestów;
  zero zastępczych płaskich materiałów w odzyskanej partii.
- Chromium/WebGL2 na buildzie produkcyjnym: sześć klas z odzyskanymi rękawicami, dziewięć modeli
  z animacjami w viewerze, walka i utrwalenie zapisu; układ mobilny 390×844.
  Test viewer/sceny z nowymi propsami: zero błędów strony, konsoli i HTTP.
- PWA: po pobraniu zasobów wyłączono sieć i odświeżono stronę — gra uruchamia się z cache
  `idlelc-v2`, WebGL2 i zapis postaci pozostają poprawne; zero błędów strony i konsoli.
- Osobno sprawdzono trzech odzyskanych przeciwników w faktycznej walce, najgęstszą arenę
  roślinności oraz rozliczenie AFK 1 h; bez błędów strony, konsoli i HTTP.

### Pozostałe ograniczenia i następne etapy

`ti_skill_10` jest jedynym jawnym wyjątkiem partii ścisłej; używa zwykłego zamachu. Nie dodano
aliasu do podobnie nazwanego klipu. Starsze MESH11/16 (m.in. nieobecny już wcześniej `st_sheaf02`),
morph maps i proceduralne FXDT pozostają nieobsługiwane. Dokładny tint tła tytułu wymaga porównania.
Fonty bitmapowe i grafiki Cashshop/CostumeInventory nie zostały arbitralnie podstawione w całym UI.

`Effect.dat` jest dostępny i częściowo odczytany, ale pełny importer definicji i renderer FX pozostają
osobnym etapem. Własne efekty gry nadal są własne. Pełne przeniesienie statystyk, statusów, damage,
trafienia i dropu wymaga rozszerzenia modelu oraz brakujących pól SQL; nie zastępujemy ich domysłami.

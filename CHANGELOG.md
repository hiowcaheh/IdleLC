# Historia zmian

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

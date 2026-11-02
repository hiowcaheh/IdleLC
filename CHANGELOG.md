# Historia zmian

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

# Dalsza korekta wyglądu i arkusza statystyk

Punkt wyjścia: `729a8b8`. Poprawki odpowiadają pięciu zgłoszeniom właściciela po
sprawdzeniu gry na telefonie: pasy przy zmianie mapy, układ i brakujące statystyki,
pierścień przy butach, zbyt niskie położenie wróżki oraz pierścień zamiast dymu tytułu.

## Ekran przejścia map

Po wcześniejszym `contain` na pionowym telefonie pozostawał wąski pas ilustracji.
Nowe polecenie właściciela zmienia priorytet: ilustracja wypełnia cały ekran przez
`cover`, ze statycznym kadrowaniem boków zamiast letterbox. Usunięto pionową maskę
tworzącą czarne pasy. Nazwa i pasek są niżej, na delikatnym przyciemnieniu.
Nie ma animowanego zoomu; zachowano dekodowanie przed pokazaniem, pasek oparty na
szerokości i reduced motion.

## Arkusz statystyk

Delikatne nagłówki i separatory rozdzielają Attributes, Health and mana, Combat,
Combat bonuses, Speed and skills, Recovery, Bonuses i Hunting record. Prędkości,
przygotowanie i odnowienie umiejętności znajdują się po polach walki.

Zakres źródłowego okna ustalono z `C/Engine/Interface/UICharacterInfo.cpp:1450–1556,2467–2516`
i pakietu `S/GameServer/CmdMsg.cpp:559–930`. Osobno są wyliczane physical/magic attack,
defense, hit i evasion, critical/deadly rating oraz prędkości biegu i chodu.
Critical/deadly rating nie jest prezentowany jako procent prawdopodobieństwa.
Brakujące wartości nie są zastępowane kopią fizycznego ataku lub sztucznym zerem.

Arkusz źródłowy i dotychczasowe `attack/defense` adaptera walki są różnymi polami.
Nie jest to automatyczne przeniesienie całego serwerowego damage ani zmiana tempa
idle. Liniowy wzrost siły sprzętu o 10% za plus pozostaje świadomą regułą projektu.
Profesje, PK i żywioły nadal wymagają osobnego modelu i kompletnych danych.

## Przypięcie pierścieni i wróżki

Poprzednie kontrole liczyły wyrenderowane modele i sprawdzały zasoby; nie wykrywały
błędnego miejsca przypięcia. GLTFLoader zmienia nazwy kości, np. `Bip01 L Hand` na
`Bip01_L_Hand`. Stary kod nie znajdował dłoni i używał podstawy postaci, dlatego
pierścień pojawiał się przy stopach. Pomijał również tag `CENTER` używany przez
źródłową ścieżkę wróżki.

Punkty pochodzą teraz z powierzchni `_TAG_T` i `_TAG_G`, według
`C/Engine/Ska/Mesh.cpp:2435–2535` oraz `RMRender.cpp:2554–2634`.
Są przeliczane ze źródłowej pozycji bind przez animowany szkielet; trzeba przy tym
uwzględnić zmianę przestrzeni bind przy optymalizacji GLB. Nieznany tag nie powinien
po cichu przypinać efektu do ziemi. Wybór dłoni wynika z grupy efektu i modelu broni,
a nie z samej liczby wyposażonych przedmiotów. Tarcza nie tworzy drugiego pierścienia;
podwójne miecze mają oba właściwe punkty.

Wróżka korzysta z `CENTER` i odzyskanej ścieżki z jej przesunięciem, co lokuje lot
obok ramienia i głowy. Nie dodajemy arbitralnej orbity wokół dłoni.

## Dym tytułów

Wcześniejsza podłogowa poświata, pierścień i gwiazdy były efektem własnym. Źródłowe
grupy `eff_name*` zawierają trzy emitery cząstek przypięte do `CENTER`, bez takiego
pierścienia. Odzyskane parametry obejmują teksturę, kształt emitera, kolor, tempo,
życie, prędkość oraz krzywe rozmiaru i alfy.

| Tytuł                       |  ID | Grupa efektu     |
| --------------------------- | --: | ---------------- |
| Highest Level for Titans    |  25 | `eff_nameT`      |
| Highest Level for Knights   |  26 | `eff_nameSKY`    |
| Highest Level for Healers   |  27 | `eff_nameGREEN`  |
| Highest Level for Mages     |  28 | `eff_nameINDIGO` |
| Highest Level for Rogues    |  29 | `eff_nameORANGE` |
| Highest Level for Sorcerers |  30 | `eff_namePURPLE` |

Kolory wynikają z definicji efektu, nie z domysłu na podstawie koloru tekstu tytułu.
GREEN ma trzy warstwy dymu, po 50 cząstek/s, życie 0,6–0,7 s, alfę 20/255 i ruch
w górę. Odtwarzacz obejmuje odzyskany podzbiór; nie jest pełnym silnikiem efektów LC.

## Walidacja

- `npm run check`: **317 testów w 37 plikach**, lint, Prettier i TypeScript — poprawne.
- `npm run build` oraz `npm run verify-lc-recovery` — poprawne; 292 modele wcześniejszej
  partii, ich mapowania i hashe pozostają spójne.
- Nowe testy rzeczywistego GLTFLoader obejmują sześć klas, sanitizowane nazwy kości,
  animowane pozy, odległości tagów dłoni poniżej 0,16 m oraz `CENTER` i uniesienie wróżki.
  Testy arkusza sprawdzają niezależne kanały, procenty od źródłowych podstaw i
  przeliczenie critical/deadly po zmianie DEX. Dla Healer20 +15 DEX daje 154/103
  zamiast 141/94; z opcjami 55/66 badanego poziomu: 169/123.
- Chromium/WebGL2: **osiem kontroli przestrzennych** — sześć klas z tytułami,
  Jenis bow +15 oraz podwójne miecze Knighta +15. Sprawdzono odległości pierścieni
  od właściwych dłoni, wróżkę obok głowy, pełne zmieszczenie jej geometrii w kadrze
  oraz trzy aktywne warstwy dymu przy ciele. Kadr podglądu jest wyższy i szerszy
  przy aktywnej wróżce, żeby nie ucinać jej nad głową wysokich klas.
- Build produkcyjny: Character na 390×844 i 1280×900, wszystkie grupy i źródłowe pola
  bez brakujących wartości, bez poziomego przewijania; można przewinąć do szybkości
  i ostatniego rekordu. Przykład Healer80: physical/magic attack **913/130**,
  hit **379/289**, evasion **287/196**, run **7,0 m/s**. Zdjęcie tytułu przez UI działa.
- Loader: **28/28** kontroli (cztery strefy × siedem rozmiarów), decode gate i
  reduced motion. Ponadto na buildzie produkcyjnym wykonano cztery rzeczywiste
  przejścia w widoku 390×844: Dratan, Merac, Egeha, Juno. Każde używa `cover`,
  bez transformacji zoom i bez poziomego overflow.
- Wszystkie końcowe przebiegi przeglądarkowe: **zero błędów strony, konsoli, HTTP
  i brakujących zasobów**. Regeneracja metadanych/tagów oraz JSON i pięciu tekstur
  tytułów daje identyczne hashe. Wynik liczbowy: [raport JSON](source-followup-validation.json).

Kontrole wykorzystują Chromium/SwiftShader i emulowane rozmiary ekranu, nie fizyczny
pomiar FPS telefonu. Spośród 24 tytułów z efektem obsługiwanych jest 16 z rodziny
`eff_name*`; osiem pozostałych używa innych rodzin, których renderer nie jest przeniesiony.
Nie zastępuje się ich już zmyśloną podłogową poświatą.

SaveVersion pozostaje 13. Bez backendu i Supabase, bez zmiany zasad bezpiecznego
ulepszania, sześciu klas, czterech stref i wypraw AFK. Surowe archiwa i źródła C++
pozostają poza repozytorium.

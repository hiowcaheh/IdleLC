# Bieganie, Inventory, przyciski i źródłowe spoty

Aktualizacja: 2026-11-05. Punkt wyjścia: `da53b1a` na `main`.
Obejmuje zgłoszenie niskiego FPS podczas biegania oraz późniejsze trzy zgłoszenia
dotyczące Inventory, kropek w przyciskach i współrzędnych potworów.
SaveVersion **14**, bez migracji i bez zmiany szybkości biegu ani zasad walki.

## Obciążenie podczas biegania

Poprzednio każde przesunięcie mapy o 2 m przeglądało wszystkie pozycje obiektów,
przepisywało macierze każdego modelu i oznaczało całe bufory do przesłania na GPU.
Przeliczano też granice osobno dla każdej części modelu, nawet bez zmiany jej listy.

Obecnie statyczne pozycje są indeksowane w komórkach 64 m. Wyszukiwanie zachowuje
dokładnie ten sam promień 120 m, wycięcie obiektów zasłaniających kamerę i kolejność
źródłowych instancji. Listy są używane ponownie. Zmiana dotyczy tylko modeli,
których zestaw instancji rzeczywiście się zmienił; bufory mają `DynamicDrawUsage`
i aktualizują jedynie aktywny prefiks. Zmiana na pustą listę i ponowny wzrost
przywracają poprawne granice renderowania. Granice całego umieszczonego modelu
obliczane są raz i współdzielone przez jego części. Klonowane materiały są
zwalniane razem z geometrią przy opuszczaniu mapy.

Sprawdzenie rzeczywistych plików map i odcinków między arenami dało **1254 zapytania**
z identyczną selekcją promienia w porównaniu z pełnym skanem:

| Mapa   | Wszystkie obiekty wcześniej | Średnio sprawdzane teraz | Redukcja sprawdzanych kandydatów |
| ------ | --------------------------- | ------------------------ | -------------------------------- |
| Juno   | 5151                        | 444                      | 91,4%                            |
| Dratan | 264                         | 30                       | 88,6%                            |
| Merac  | 5667                        | 715                      | 87,4%                            |
| Egeha  | 5205                        | 465                      | 91,1%                            |

W osobnych przebiegach tej samej aplikacji i przygotowanych zapisów wykonano po
cztery przejścia między pierwszymi dwoma spotami Juno i Merac. Instrumentacja była
wstrzykiwana przez lokalny serwer testowy; nie trafiła do kodu produkcyjnego.

| Mapa  | Bajty buforów na odświeżenie wcześniej | Po zmianie | Redukcja |
| ----- | -------------------------------------- | ---------- | -------- |
| Juno  | 294896                                 | 10112      | 96,6%    |
| Merac | 490876                                 | 35381      | 92,8%    |

To pomiar pracy renderera i przesyłania danych, **nie potwierdzenie wyższego FPS
na telefonie**. Programowy SwiftShader w tym środowisku osiągał około 2–2,5 FPS
zarówno przed zmianą, jak i po niej. Nie wykazał wzrostu FPS. Nie używamy tych
wyników jako pomiaru iPhone'a. Ograniczono potwierdzony narzut odświeżania otoczenia;
faktyczna płynność urządzenia gracza wymaga dalszej weryfikacji. Zapytano o mapę,
ustawienie jakości i model telefonu. Presety grafiki i zasięg pozostają bez zmian.

## Inventory i przyciski

- Inventory korzysta ze wspólnego GUI klienta i źródłowych `skills-tab.webp`
  oraz `skills-tab-active.webp`. Na telefonie sześć filtrów mieści się w dwóch
  rzędach, a od szerokości 600 px w jednym. Wysokość okna nie zależy od filtra.
- Przyciski zakupu, sprzedaży i nauki skilli mają etykietę oraz wartość oddzielone
  odstępem CSS. Usunięto środkową kropkę z tych akcji. Zachowano ikonę złota,
  kolory kwot i informację o kosztach SP. Liczniki zakładek Appraisera są w nawiasach.
- Produkcyjny build sprawdzono przy **320, 390 i 1280 px**. Wszystkie sześć filtrów
  jest widoczne i przełącza stan; ramka zakładki pochodzi z atlasu klienta.
  Zakup mikstury zmniejszył złoto o 440 i zwiększył ilość o 1; sprzedaż jednej
  zwiększyła złoto o 176 i zmniejszyła ilość o 1. Obie ceny odczytano z GUI.
- Sprawdzono przejścia Juno/Dratan/Merac oraz oddzielnie bieg Bogle → Elite Bogle
  → Bogle w Egeha. Brak błędów JS, konsoli i HTTP w końcowych testach przeglądarki.

## Współrzędne oryginalnych spotów: potrzebne dane

Nie wprowadzono zgadywanych współrzędnych. Aktualne areny wszystkich map,
w tym wskazanej przez właściciela Juno, pozostają bez zmian.

Źródło serwera November 2018, `GameServer/Zone.cpp:381–398`, pobiera konkretne
pozycje przez `SELECT * FROM t_npc_regen WHERE a_zone_num = … ORDER BY a_index`
i odczytuje `a_npc_idx`, `a_pos_x`, `a_pos_z`, `a_y_layer` oraz obrót `a_pos_r`.
Obecny eksport `lc-data.json` zawiera przypisanie NPC do stref, bez pozycji.
Importer również zachowuje z tej tabeli tylko powiązanie NPC ze strefą.

W otrzymanych archiwach i bieżącym workspace nie ma zrzutu `t_npc_regen` ani
`newproject_data.sql`. Pliki świata Dratan i Egeha nie mają markerów spawnów NPC;
Merac ma `LightBeam_spawn`, ale to obiekt efektu. `mobhelp.lod` zawiera 300 rekordów
po 8 bajtów: identyfikator i numer strefy. Potwierdza to `Common/header/def_npc.h:46–54`.
Nie zawiera współrzędnych. `mobAll.lod` opisuje prototypy NPC, nie ich instancje
na mapie. Historyczna notatka o zgodności wysokości Dratan nie zastępuje listy
konkretnych pozycji.

Zapytano właściciela o link do tabeli lub pełnego zrzutu. Po otrzymaniu danych
trzeba zachować rzeczywiste X/Z i powiązanie z NPC/strefą, potwierdzić zgodność
z WTR, a następnie ponownie wygenerować otoczenie. Obecne props są przycięte do
starej trasy aren; zmiana samego `terrain.json` pozostawiłaby puste otoczenie
w nowych miejscach. Nie przenosić Juno w ramach tego zgłoszenia.

## Walidacja

Dodano sześć testów: granice promienia i ujemne komórki, korytarz kamery,
stała kolejność i ponowne użycie list, zgodność ze starym pełnym skanem,
ograniczenie kandydatów oraz zmniejszanie/zerowanie/powiększanie bufora GPU.
`npm run check` zaliczył lint, format, TypeScript i **422/422 testy w 48 plikach**.
`npm run build` zakończył się sukcesem. Produkcyjne pliki JS nie zawierają sondy pomiarowej.
Pomiary i zakres kontroli: [running-inventory-validation.json](running-inventory-validation.json).

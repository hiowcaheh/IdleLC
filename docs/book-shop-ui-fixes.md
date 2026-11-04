# Book, Character, Skills i warianty sprzętu w sklepie

2026-11-04, punkt wyjścia `b0f10ab`. Zakres: osiem kolejnych zgłoszeń właściciela.
SaveVersion pozostaje **14**. [Wyniki kontroli](book-shop-ui-validation.json).

## Układ okien

1. Book ma dwie równe kolumny o wysokości dostępnej części okna. Lista potworów
   i szczegóły mają własne przewijanie; przewinięcie lewej listy do końca nie jest
   warunkiem przewijania informacji. Działa kółko myszy, dotyk i fokus klawiatury.
   Pionowy gest nad podglądem 3D też przewija prawą kolumnę. Obrót podglądu myszą
   pozostaje dostępny. Pasek centruje licznik, a prezenty mają 16×16 px zamiast 23×23.
2. Cztery pola sum atrybutów mają jednakowe 58×24 px i stałe kolumny na wartości
   i plusy. Przy 390 px są dwa symetryczne zestawy; poniżej 361 px jedna kolumna
   zachowuje miejsce na pełne nazwy. Plus pozostaje poza polem wartości.
3. Ikona SP jest pełnym wycinkiem 20×20 z `Data/Interface/skill_new.tex`,
   współrzędne 844,548, eksport ×3. Character, Skills i informacje skilla używają
   tej samej ikony w rozmiarze 20 px. Skills nie rozciąga całego źródłowego pola
   SP razem z osadzoną w nim grafiką.
4. Informacje bieżącego i następnego poziomu skilla mają po 10 px wewnętrznego
   odstępu z obu stron. Nagłówek sekcji zachowuje pełną szerokość.
5. `Mastered` jest przy typie i poziomie pod nazwą skilla w liście oraz w nagłówku
   jego modalu. Usunięto powtórzony komunikat na dole.
6. Oryginalny `QuestBook.tex` zawiera dwa puste ciemne pola przy dolnej krawędzi.
   Ich rozciąganie w `border-image` tworzyło kreski. Konwerter kopiuje czystą
   kolumnę 350 w środkowej części ostatnich dziesięciu wierszy, zachowując narożniki
   i obramowanie. Dół okna ma jednolite szare tło.
7. Saldo Shop ma ramkę oryginalnego `value-box.webp`, z istniejącą ikoną monety
   i kolorem kwoty.

Przeliczone grafiki: `public/ui/lc/sp-icon.webp` i `book-window.webp`.
Adresy tych dwóch grafik w CSS zawierają skrót SHA-256, aby pamięć PWA nie pokazała
poprzedniego wycinka przy pierwszym otwarciu po aktualizacji.
Reprodukcja:

```sh
npm run convert-lc -- --client '<klient 2015>' --only ui
```

## Najlepsze dostępne pule rare w sklepie

Ósme zgłoszenie zmienia wybór wariantu sprzętu oferowanego w istniejącym wierszu
sklepu. Importowana lista progów nadal określa sloty i poziomy. `shopOffer` wybiera
z zaimportowanych przedmiotów wariant o lepszej puli pieczęci. Tę samą ofertę
sprawdza `applyBuy`, więc UI i serwis akceptują ten sam ID.

Rodzinę rozpoznaje się po oryginalnej komórce ikony, typie, slocie/podtypie, klasie,
poziomie, cenie, możliwości ulepszania i identycznych bazowych ATK/DEF/interwale.
Porównanie nazwy nie wystarcza: źródło zawiera m.in. `Tyrant shirt` / `Tyrant Shirt`
oraz `Reidon Boots` / `Rument Boots`. Osobne komórki ikon w wygenerowanym atlasie
też nie są dowodem innego wyglądu; używane są współrzędne oryginalnego atlasu.
W danych zastępczych bez LC porównuje się nazwy bez rozróżniania wielkości liter.

Kolejność wyboru: maksymalna możliwa liczba pieczęci, najlepsza klasa, szansa tej
klasy, średnia jakość pozostałych wyników, liczba zestawów najlepszej klasy.
Przy remisie zachowany jest poprzedni wariant. Zwykłe przedmioty bez puli rare
pozostają zwykłe. Oferta zachowuje jeden wiersz na rodzinę, dotychczasową cenę
i poprzedni/bieżący/następny próg poziomu.

Przykłady Healer dostępne w sklepie przy poziomie 80:

| Część          | Poprzedni ID | Oferowany ID | Poziom | Przykładowe zestawy A z sześcioma pieczęciami |
| -------------- | -----------: | -----------: | -----: | --------------------------------------------- |
| Reviving Tiara |         1868 |         1955 |     77 | Casting-Up 53, Arcane 62 (Evasion)            |
| Reviving Shirt |         1869 |         1956 |     76 | Anti-Silence 57, Anti-Stone 60                |
| Reviving Skirt |         1870 |         1957 |     76 | Anti-Silence 57, Anti-Stone 60                |
| Reviving Boots |         1872 |         1959 |     77 | Speed-Up 59                                   |

Pule i wagi pochodzą z istniejących `t_item` / `t_rareoption`, włącznie z wcześniej
uzgodnionym rozszerzeniem P04. Zakupiony przedmiot trafia jako nieodkryty do torby.
Appraiser stosuje jego rzeczywistą pulę i dotychczasowe szanse lupy, zestawu oraz
każdej pieczęci. Sześć opcji i niebieska klasa A są możliwe, a nie gwarantowane.
Sklep podpisuje maksymalną liczbę pieczęci i możliwą klasę; po rozwinięciu wiersza
wymienia najlepsze zestawy właściwe dla tego przedmiotu.

Nie zmienia to istniejących sztuk sprzętu, ich opcji, UID, plusów ani zasad
czasowego dodawania opcji. Drop i Appraiser nadal używają wspólnych definicji
przedmiotów. Nie dopisano sztucznych zestawów do zwykłego sprzętu poniżej 73.
poziomu. Brak migracji zapisu oraz nowych zależności.

## Kontrola

- `npm run check`: lint, formatowanie, TypeScript i **389 testów / 43 pliki**.
  Cztery nowe testy obejmują wybór wariantu, zakup i odkrycie sześciu pieczęci,
  zachowanie losowości, odrzucanie innych części/klas/cen/statystyk, zwykły sprzęt,
  zerowe wagi i lepszy rozkład pozostałych klas przy takiej samej szansie A.
- `npm run build`: poprawny build produkcyjny.
- Chromium, rzeczywiste komponenty i dane LC: 320×740, 390×844 i 1280×740.
  Sprawdzono niezależny scroll kółkiem, trzy gesty dotykowe (lewa/prawa/podgląd),
  położenie licznika, rozmiar prezentów, równość pól, SP, `Mastered`, odstępy obu
  poziomów i ramkę salda. Bez przewijania poziomego i błędów strony/zasobów.
- Audyt wszystkich 687 wpisów progów sześciu klas: 37 otrzymuje lepszy wariant,
  650 pozostaje przy dotychczasowym. Ceny, poziomy, sloty i bazowe parametry są
  zachowane. Wykonano 39 zakupów i identyfikacji w `LocalGameService` z kontrolowanym
  RNG, w tym po sześć pieczęci dla casting, evasion, silence, stone i run speed
  zgodnie z dostępnymi pulami. Wyniki sprawdzono też w trwałym zapisie serwisu.
- Pełna aplikacja po produkcyjnym buildzie: 390×844 i 1280×900, bez błędów strony,
  konsoli, żądań i HTTP. Przez GUI wykonano ulepszenie Self Heal, zakup Reviving
  Tiara 1955, zakup złotej lupy i odkrycie sprzętu. Po odświeżeniu zachowały się
  zarówno wyższy poziom skilla, jak i identyczny UID/zestaw/opcje przedmiotu.
- PWA z aktywnym service workerem i starymi grafikami z `b0f10ab` w cache:
  oba nowe adresy załadowały się od razu przez worker, z poprawnymi SHA-256.
  Stare wpisy nie przesłoniły nowych obrazów. Bez błędów strony/konsoli/żądań/HTTP.

Rozdzielenie scrolla sprawdzono w Chromium. Pozostaje kontrola odczucia gestów
na fizycznym iPhonie właściciela; wynik testu nie jest deklaracją wykonania testu Safari.

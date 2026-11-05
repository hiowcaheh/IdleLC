# Płynne podbieganie do potwora

Data: 2026-11-05. Punkt wyjścia: `d0d2a5d`.
Właściciel doprecyzował objaw: szarpanie postaci dotyczy podbiegania do następnego
potwora na tym samym spocie, przy prawidłowym FPS. Podróż do innego spotu działała
normalnie.

## Przyczyna i korekta

`VisibleClock` oddaje czas logice w krokach **50 ms**. `Battle` rysowało podbieganie
bezpośrednio z `combat.phaseTime`, a obrót wykonywało przy użyciu tego samego
skokowego czasu. Przy około 60 klatkach renderowania na sekundę pozycja i obrót
zmieniały się około 20 razy, chociaż klip biegu był odtwarzany normalnie.

Getter `interpolationSeconds` udostępnia pozostały ułamek czasu bez jego zużywania
ani zmiany symulacji. `approachProgress` dodaje ten ułamek wyłącznie przy rysowaniu
podbiegania, z uwzględnieniem czasu dojścia i dev time scale. Zachowuje dotychczasową
krzywą ruchu i blokuje przewidywanie ruchu przy stun, stone lub hold. Nie przewiduje
całej zaległości czasu ani ruchu w ukrytej karcie. Na zdarzeniu `engage` pozycja
dochodzi dokładnie do celu. Obrót ku potworowi używa czasu każdej klatki.

Nie zmieniono `Character`, natywnych klipów i ich tempa, kroków logiki,
`approachTime`, `travelTime`, bilansu ani zapisu. Bieg między spotami korzysta
z istniejącej ścieżki. SaveVersion pozostaje **14**.

## Pomiar ruchu

W lokalnym serwerze testowym wstrzyknięto sondę do rzeczywistych `Battle`,
`Character` i `CameraRig`, z modelami i animacjami LC. W tej próbie wyłączono
rysowanie tła i klatek GPU, aby otrzymać częste klatki bez wpływu programowego
SwiftShader. To test współrzędnych, obrotu i czasu klipu; nie benchmark FPS telefonu.
Sonda nie znajduje się w buildzie produkcyjnym.

Uzdrowicielka, osobne przebiegi przed i po, mediana odstępu klatek w obu **16,7 ms**:

| Wersja | Pary kolejnych klatek podbiegania | Ze zmianą pozycji | Bez zmiany pozycji |
| ------ | --------------------------------- | ----------------- | ------------------ |
| Przed  | 167                               | 54                | 113                |
| Po     | 123                               | 123               | 0                  |

Obrót w pierwszych 0,3 s podejścia zmieniał się w 18/60 par klatek przed poprawką
i 44/44 po niej. Tempo klipu biegu w obu próbach wynosiło **1,0**.

Osobno sprawdzono sześć klas po zmianie:

| Klasa    | Pary klatek | Ze zmianą pozycji | Nieruchome już na celu |
| -------- | ----------- | ----------------- | ---------------------- |
| Healer   | 114         | 114               | 0                      |
| Titan    | 164         | 163               | 1                      |
| Knight   | 126         | 126               | 0                      |
| Mage     | 195         | 195               | 0                      |
| Rogue    | 177         | 177               | 0                      |
| Sorcerer | 168         | 165               | 3                      |

Nieruchome próbki Titana i Sorcerera wystąpiły po osiągnięciu celu, w oczekiwaniu
na najbliższy krok logiki rozpoczynający walkę. Potwierdzono ich zgodność
z pozycją w następnej fazie. We wszystkich klasach klip biegu miał tempo 1,0.

## Walidacja

- **435/435 testów w 49 plikach** oraz lint, Prettier i TypeScript przeszły.
- Nowe testy obejmują płynne pozycje przy 30/60/90/120 FPS, dev time scale
  0,5/1/2, Run speed, dojście do celu, stun/stone/hold, ukrytą kartę i zaległość czasu.
- Dotychczasowe testy `VisibleClock` nadal potwierdzają identyczne wyniki i zdarzenia
  RNG przy 2/5/10/20/60 FPS. Odczytywanie ułamka czasu nie zmienia symulacji.
- `npm run build` zakończył się sukcesem. Oddzielna kontrola produkcyjnej sceny
  sprawdza dalsze zabójstwa, okno skilla i przejście na drugi spot.

[Dane walidacji](approach-motion-validation.json). Bez testu na fizycznym iPhonie/Safari.

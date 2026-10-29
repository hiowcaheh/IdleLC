# Balans — wzory

Wszystkie wzory są w `src/game/logic/balance.ts`, a czasy faz walki w `src/game/logic/combat.ts`
(`TIMINGS`). Zmiana wzoru = zmiana kodu + tego dokumentu + testów w `balance.test.ts`.

> Statystyki klas i wzory walki są **robocze (własne)** — baza LC ich nie ma. Zastąpimy je
> wartościami z kodu serwera LC, gdy właściciel go dostarczy. Exp, poziomy i nagrody za potwory
> są już 1:1 z bazy (patrz „Doświadczenie i nagrody”).

## Statystyki

| Statystyka       | Opis                                           |
| ---------------- | ---------------------------------------------- |
| `maxHp`          | maksymalne zdrowie                             |
| `attack`         | atak                                           |
| `defense`        | obrona                                         |
| `attackInterval` | sekundy między kolejnymi atakami               |
| `critChance`     | szansa na cios krytyczny (0–1), gdy cios trafi |
| `critMultiplier` | mnożnik obrażeń przy krytyku                   |

### Statystyki klasy na poziomie

```
stat(poziom) = round(base + perLevel × (poziom − 1))     dla maxHp, attack, defense
```

Pozostałe statystyki (szybkość ataku, krytyk) na razie nie rosną z poziomem.
Poziom jest ograniczony do zakresu 1–99 (`MAX_LEVEL`).

| Klasa    | HP  | Atak | Obrona | Interwał | Krytyk   | +HP/poz | +Atak/poz | +Obr/poz |
| -------- | --- | ---- | ------ | -------- | -------- | ------- | --------- | -------- |
| Titan    | 140 | 14   | 6      | 1,6 s    | 8% ×1,8  | 14      | 2,2       | 0,9      |
| Knight   | 160 | 11   | 9      | 1,3 s    | 5% ×1,5  | 16      | 1,7       | 1,3      |
| Healer   | 110 | 9    | 5      | 1,2 s    | 5% ×1,5  | 11      | 1,4       | 0,8      |
| Mage     | 95  | 15   | 4      | 1,5 s    | 10% ×1,7 | 9,5     | 2,4       | 0,6      |
| Rogue    | 105 | 11   | 5      | 0,95 s   | 14% ×1,6 | 10,5    | 1,7       | 0,7      |
| Sorcerer | 120 | 13   | 6      | 1,35 s   | 8% ×1,6  | 12      | 2         | 0,9      |

## Trafienie

```
szansaTrafienia = clamp(0,92 + 0,02 × (poziomAtakującego − poziomBroniącego), 0,50, 0,98)
```

Równy poziom: 92%. Każdy poziom przewagi +2%, każdy poziom niedoboru −2%.

## Obrażenia

```
bazowe   = max(1, atak² / (atak + obrona))
rozrzut  = losowo z [0,9; 1,1]
obrażenia = max(1, round(bazowe × rozrzut × (krytyk ? critMultiplier : 1)))
```

Wzór `atak² / (atak + obrona)` daje malejące zyski z obrony: obrona równa atakowi
połowi obrażenia, ale nigdy ich nie zeruje.

Przykład: Knight (atak 11) vs Rust Golem (obrona 3): `121 / 14 ≈ 8,6` obrażeń na cios.

## Regeneracja

Poza walką (szukanie potwora, podbieganie, po zwycięstwie) gracz odzyskuje **3% maks. HP na sekundę**.
W trakcie walki i po śmierci regeneracji nie ma.

## Przebieg walki (czasy)

| Faza       | Czas  | Co się dzieje                                            |
| ---------- | ----- | -------------------------------------------------------- |
| `spawning` | 1,0 s | brak potwora, potem pojawia się nowy (pełne HP)          |
| `approach` | 1,3 s | gracz podbiega do potwora                                |
| `fighting` | —     | wymiana ciosów aż ktoś zginie                            |
| `victory`  | 2,2 s | animacja śmierci potwora, potem znika                    |
| `defeat`   | 3,0 s | gracz leży, potem wstaje z pełnym HP i szuka nowego celu |

- Gracz atakuje pierwszy. Potwór zaczyna po połowie swojego interwału.
- Cios trafia **0,4 s po rozpoczęciu zamachu** (`impactDelay`). Animacja ataku jest
  dopasowywana do tego czasu niezależnie od modelu.
- Gdy ktoś zginie, jego rozpoczęty cios przepada.

## Tryb LC — tymczasowe statystyki gracza

W bazie LC nie ma statystyk startowych klas, a wartości potworów LC są w innej skali niż nasze
zastępcze klasy. Dopóki nie ustalimy statystyk klas (M3), w trybie LC (dane z bazy LC) gracz jest
**skalowany do potworów ze swojego poziomu** (`src/game/logic/lcBalance.ts`, wartości własne):

- bierzemy zwykłe (nie elitarne) potwory w oknie ±3 poziomy i liczymy medianę HP, obrony i ataku,
- atak gracza dobieramy tak, żeby typowy potwór padał po ~8 ciosach (`atak² / (atak + obrona) = HP / 8`),
- obrona gracza = 2 × atak potwora (potwór zadaje ok. ⅓ swojego ataku),
- HP gracza = max(100 + 60 × poziom, 30 ciosów potwora).

Interwał ataku i krytyki zostają z klasy. Interwał ataku potwora LC = `a_attackSpeed / 10` s (założenie).

## Doświadczenie i nagrody

- **Exp na poziom** — `t_exp` z bazy 1:1 (`src/game/data/progression.ts`): `EXP_TABLE[poziom − 1]` to exp
  potrzebny z poziomu `poziom` na następny (1 → 34, 10 → 18 748, 30 → 4 046 233). Nadmiar przechodzi na
  kolejny poziom; jedna nagroda może dać kilka poziomów. Na poziomie 99 exp się nie zbiera. Bez danych LC
  działa zastępcza krzywa `30 × poziom^2,2`.
- **Nagroda za zabicie** — `t_npc.a_exp` i `a_prize` (złoto) 1:1 (`src/game/logic/rewards.ts`).
  Kary i premie za różnicę poziomów, drużynę i exp tracony po śmierci dodamy z kodu serwera.
- **Limit zabić** — przeglądarka tylko pokazuje walkę i zgłasza jej wynik (`reportCombat`). Serwis płaci
  za najwyżej `floor(czas od poprzedniego zgłoszenia × prędkość gry / 3,2 s) + 2` zabić. 3,2 s to najkrótszy
  możliwy cykl (2,2 s zwycięstwa + 1,0 s na nowego potwora). Prędkość gry > 1 jest tylko w narzędziach dev;
  na serwerze (Supabase) zawsze 1. Patrz [`docs/supabase.md`](supabase.md).

## Drop

Każde zabicie losuje tabelę dropu potwora 1:1 z bazy (`t_npc.a_item_0…19` z szansą `a_item_percent_N / 10000`).
Każdy wpis losujemy **osobno** (jedno zabicie może dać kilka przedmiotów) — założenie do sprawdzenia
w kodzie serwera LC (tam mogą być dodatkowe zasady: mnożnik dropu serwera, różnica poziomów, drop z „+”).
Przedmioty trafiają do ekwipunku jako stosy (jeden stos na rodzaj; osobne egzemplarze sprzętu z ulepszeniem
dojdą w M5). Ekwipunek nie ma na razie limitu miejsc.

## AFK (czas poza grą)

- Czas od ostatniej aktywności postaci (`lastPlayedAt` — ostatnie zgłoszenie walki) liczy się jako polowanie
  AFK na ostatnio wybranego potwora, **maksymalnie 8 h**. Krótsze niż 1 min przerwy się nie liczą.
- Odbiór: przy wejściu do gry postacią i przy powrocie do karty/aplikacji (np. po odblokowaniu telefonu).
- Tempo polowania mierzymy na **prawdziwej symulacji walki** (`measureHuntRate`: 20 minut walki tymi samymi
  wzorami co na ekranie) osobno dla każdego poziomu postaci; czas AFK dzielimy na 10-minutowe odcinki,
  więc awans w trakcie AFK wzmacnia postać. Wynik: zabicia (z losowym zaokrągleniem), śmierci, exp,
  złoto i drop jak za zwykłe zabicia. `AFK_EFFICIENCY = 1` (wartość własna: AFK daje tyle co gra przy
  włączonym ekranie).
- Jedno zgłoszenie walki obejmuje najwyżej 10 minut (`MAX_REPORT_WINDOW`), więc za czas poza grą płaci
  tylko symulacja AFK.

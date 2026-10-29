# Balans — wzory

Wszystkie wzory są w `src/game/logic/balance.ts`, a czasy faz walki w `src/game/logic/combat.ts`
(`TIMINGS`). Zmiana wzoru = zmiana kodu + tego dokumentu + testów w `balance.test.ts`.

> Liczby w `src/game/data/` są **robocze** (do strojenia). Docelowy balans ustalimy razem
> przy M3 (exp, poziomy, łupy).

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

| Klasa  | HP  | Atak | Obrona | Interwał | Krytyk   | +HP/poz | +Atak/poz | +Obr/poz |
| ------ | --- | ---- | ------ | -------- | -------- | ------- | --------- | -------- |
| Titan  | 140 | 14   | 6      | 1,6 s    | 8% ×1,8  | 14      | 2,2       | 0,9      |
| Knight | 160 | 11   | 9      | 1,3 s    | 5% ×1,5  | 16      | 1,7       | 1,3      |
| Healer | 110 | 9    | 5      | 1,2 s    | 5% ×1,5  | 11      | 1,4       | 0,8      |
| Mage   | 95  | 15   | 4      | 1,5 s    | 10% ×1,7 | 9,5     | 2,4       | 0,6      |

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
zastępcze klasy. Dopóki nie ustalimy statystyk klas (M3), w trybie LC (`VITE_LC_DATA=1`) gracz jest
**skalowany do potworów ze swojego poziomu** (`src/game/logic/lcBalance.ts`, wartości własne):

- bierzemy zwykłe (nie elitarne) potwory w oknie ±3 poziomy i liczymy medianę HP, obrony i ataku,
- atak gracza dobieramy tak, żeby typowy potwór padał po ~8 ciosach (`atak² / (atak + obrona) = HP / 8`),
- obrona gracza = 2 × atak potwora (potwór zadaje ok. ⅓ swojego ataku),
- HP gracza = max(100 + 60 × poziom, 30 ciosów potwora).

Interwał ataku i krytyki zostają z klasy. Interwał ataku potwora LC = `a_attackSpeed / 10` s (założenie).

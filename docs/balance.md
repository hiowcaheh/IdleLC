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
| `maxMp`          | mana na umiejętności (potwory nie mają)        |

Tylko z umiejętności (domyślnie 0): `hit` / `dodge` (punkty procentowe szansy trafienia), `hpRegen` /
`mpRegen` (HP/MP na 5 s), `castTime` (sekundy dodane do rzucania).

### Statystyki klasy na poziomie

```
stat(poziom) = round(base + perLevel × (poziom − 1))     dla maxHp, attack, defense
```

Pozostałe statystyki (szybkość ataku, krytyk) na razie nie rosną z poziomem. Mana:
`maxMp = round(mana.base + mana.perLevel × (poziom − 1))` — Titan 40 (+4), Knight 45 (+4,5), Healer 60 (+7),
Mage 70 (+8), Rogue 45 (+4,5), Sorcerer 55 (+6) (wartości własne).
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
szansaTrafienia = clamp(0,92 + 0,02 × (poziomAtakującego − poziomBroniącego)
                        + (hitAtakującego − dodgeBroniącego) / 100, 0,50, 0,98)
```

Równy poziom: 92%. Każdy poziom przewagi +2%, każdy poziom niedoboru −2%. `hit` i `dodge` dają umiejętności.

## Obrażenia

```
bazowe   = max(1, atak² / (atak + obrona))
rozrzut  = losowo z [0,9; 1,1]
obrażenia = max(1, round(bazowe × rozrzut × mnożnikSkilla × (krytyk ? critMultiplier : 1)))
mnożnikSkilla = 1 dla zwykłego ciosu, 1 + a_power / 100 dla umiejętności (np. power 300 → ×4)
```

Wzór `atak² / (atak + obrona)` daje malejące zyski z obrony: obrona równa atakowi
połowi obrażenia, ale nigdy ich nie zeruje.

Przykład: Knight (atak 11) vs Rust Golem (obrona 3): `121 / 14 ≈ 8,6` obrażeń na cios.

## Regeneracja

Poza walką (szukanie potwora, podbieganie, po zwycięstwie) gracz odzyskuje **3% maks. HP i 2% maks. MP na
sekundę**. W trakcie walki: HP nie wraca, MP wraca 0,5% maks. na sekundę. Do tego premie z umiejętności
(`hpRegen` / `mpRegen` — wartość z bazy na 5 s, nasze odczytanie). Po śmierci postać wstaje z pełnym HP i MP,
a buffy znikają.

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

## AFK — wyprawy

- Gracz wysyła postać na **wyprawę** (przycisk „Expedition” w panelu polowania). Postać poluje na wybranego
  potwora, a walka na ekranie staje. Start zapisuje czas (`expedition.startedAt`); wyprawa przetrwa
  zamknięcie gry.
- Powrót („Return now”) płaci `min(teraz − start, 8 h)`; wyprawa krótsza niż 1 min nie daje nic. Bez wyprawy
  czas poza grą nie daje nagród (aktywna gra albo wyprawa — jak w opisie M4).
- Tempo polowania mierzymy na **prawdziwej symulacji walki** (`measureHuntRate`: 20 minut walki tymi samymi
  wzorami co na ekranie) osobno dla każdego poziomu postaci. Czas wyprawy dzielimy na 10-minutowe odcinki,
  więc awans w trakcie wyprawy wzmacnia postać. Wynik: zabicia (z losowym zaokrągleniem), śmierci, exp,
  złoto, SP i drop jak za zwykłe zabicia. Symulacja używa nauczonych umiejętności postaci. `AFK_EFFICIENCY = 1` (wartość własna: wyprawa daje tyle co gra przy
  włączonym ekranie). Okno przed wysłaniem pokazuje oczekiwane zabicia, exp i złoto na godzinę.
- Jedno zgłoszenie walki obejmuje najwyżej 10 minut (`MAX_REPORT_WINDOW`), więc czas poza grą może zapłacić
  tylko wyprawa.

## Umiejętności

Dane 1:1 z bazy: `t_skill` (klasa, typ, cel, czasy w 1/10 s), `t_skilllevel` (mana, HP, czas trwania,
wymagany poziom postaci, koszt SP, wymagane inne umiejętności) i `t_magic` + `t_magiclevel` (efekty i ich moc).
Interpretacja efektów jest **nasza** (`src/game/logic/skills.ts`) do czasu kodu serwera.

- **SP** — za zabicie `t_npc.a_skill_point`, liczone jak na serwerze LC w 1/10 000 punktu (Fox: 1375 →
  0,1375 SP). Nauka kolejnego poziomu kosztuje `a_learnSP` pełnych punktów i wymaga `a_learnLevel` oraz
  wymaganych umiejętności. Nowa postać zna 1. poziom darmowych umiejętności z poziomu 1 (np. Knuckle Spear).
- **Czasy** — `a_readyTime / 10` s to przygotowanie (np. czarowanie maga, 0 dla większości ataków; skraca je
  „Fast Spell Casting”), potem skill trafia jak zwykły cios (+0,4 s). `a_fireTime` to w LC animacja **po**
  wystrzeleniu — dopóki nie mamy animacji skilli z klienta, postać nie stoi w tym czasie
  (`TIMINGS.skillAnimationLock = 0`) i rusza dalej po zwykłym interwale ataku. Odnowienie
  `max(przygotowanie, a_reuseTime / 10)` liczone od początku rzucania, efekty trwają `a_durtime / 10` s.
- **Efekty** (`t_magic` typ/podtyp):
  - typ 3 — obrażenia: cios × `1 + power/100`;
  - typ 0 — zmiana statystyki: 0 atak, 1 obrona, 2 atak magiczny → atak, 3 obrona magiczna → obrona, 4 celność,
    5 unik, 6 szansa krytyka (power/10 %), 7 i 23 szybkość ataku, 8 czas rzucania, 10/11 regeneracja HP/MP,
    12/13 maks. HP/MP, 14 obrażenia krytyczne (power %), 22 atak %; `a_damagetype` 2 = procent;
  - typ 2 — stany: 2, 5, 7 ogłuszenie (power > 0 = szansa %), 16 spowolnienie ataku, 10 regeneracja MP,
    0 trucizna (power obrażeń na sekundę);
  - typ 4 — 0 leczenie (power HP), 1 przywrócenie many (power MP);
  - reszta (przywołania, prędkość ruchu, wskrzeszenie, oczyszczanie) — w IdleLC jeszcze nie działa; takie
    umiejętności (i te, które ich wymagają) są szare i nie da się ich uczyć.
- **Rodzaje** — umiejętność z obrażeniami = atak; ogłuszenie / trucizna / same ujemne statystyki na cel =
  klątwa (na potwora); leczenie / mana = odnowa; reszta aktywnych = buff (na siebie); `a_type 3` = pasywna
  (zawsze działa, wliczona w statystyki).
- **Auto-walka** — gdy bohater może działać, wybiera spośród gotowych umiejętności z włączonym AUTO, na które
  ma manę: 1) odnowa, gdy HP < 60% (lub MP < 40% dla many), 2) buff, którego nie ma, 3) klątwa, której nie ma
  na potworze, 4) najsilniejszy atak; inaczej zwykły cios. Ogłuszony nie atakuje (ogłuszenie przerywa
  rzucanie). Klątwy znikają z potworem; buffy trwają między walkami.
- Ten sam kod liczy walkę na ekranie i tempo wypraw AFK, więc umiejętności przyspieszają też wyprawy.

## Ekwipunek (M5)

Dane 1:1 z `t_item`: slot (`a_wearing` 0 hełm, 1 zbroja, 2 broń, 3 spodnie, 4 tarcza — tylko Knight, 5 rękawice,
6 buty), klasy (`a_job_flag`), wymagany poziom (`a_level`), broń: atak `a_num_0`, atak magiczny `a_num_1`,
**szybkość ataku `a_num_2 / 10` s** (miecz 1,0 s, topór 1,6 s — zastępuje interwał klasy); zbroja: obrona
`a_num_0`, obrona magiczna `a_num_1`. Nowa postać nosi **darmowy zestaw startowy klasy** z bazy (cena 0, poziom 1,
np. Knight: Lancer Sword, Squire Helm/Shirt/Pants/Gloves/Boots, Scale Shield).

**Jak sprzęt wpływa na walkę (własne, tymczasowe — do czasu wzorów z kodu serwera).** Bazowe statystyki postaci
są skalowane do potworów (patrz „Tryb LC”), więc liczby ze sprzętu LC nie dodają się wprost. Sprzęt mierzymy
względem **typowego sprzętu klasy na danym poziomie** (`gearReference`, liczone przez `import-lc-db`: dla każdego
slotu mediana mocy najnowszego progu dostępnych przedmiotów — drop, sklepy, zestaw startowy — z ich główną linią
cenową, bez drogich zestawów premium):

```
moc       = (atak + atak mag.) albo (obrona + obrona mag.) × (1 + 0,1 × plus)
atak      = atakPoziomu  × (0,6 + 0,4 × mocBroni / typowaBroń)
obrona    = obronaPoziomu × (0,5 + 0,5 × mocZbroi / typowaZbroja)     (mocZbroi = suma slotów poza bronią)
```

Typowy sprzęt = dotychczasowy balans; bez broni zostaje 60% ataku, bez zbroi 50% obrony; lepszy albo
ulepszony sprzęt daje więcej (np. broń +5 = 150% typowej → 120% ataku).

**Ulepszanie +0…+15** (okno Character): zużywa jeden kamień — najpierw Smelting Stone (`t_item` 84), potem
Heaven Stone (85, sprzedawany w Juno za 1 000). Szansa z +N (własne): 95, 90, 85, 75, 65, 55, 50, 45, 40, 35,
30, 25, 20, 15, 10%. Porażka od +3 zabiera jeden „+”, niżej tylko kamień. Każdy „+” = +10% mocy przedmiotu.
Smelting Stone w LC wypada z potworów według zasady serwera, której nie ma w bazie — u nas **1% na zabicie
każdego potwora** (`GENERAL_DROPS`, własne). Poziom kamienia z LC („do przedmiotów tego samego poziomu”) pomijamy.

Ulepszać można tylko przedmioty z flagą ulepszania (`t_item.a_flag` bit 2) — broń i zbroje tak, akcesoria nie.

**Akcesoria i opcje.** Trzy sloty na akcesoria (`a_wearing` 7). Zwykłe akcesoria z bazy („Magical Accessory”:
sznury, kamienie, oczy, kolczyki, pierścienie) nie mają własnych statystyk — całą ich moc dają **opcje**
(`t_option`, 1:1): na jakim przedmiocie opcja może się pojawić (maski `a_weapon_type` / `a_wear_type` /
`a_accessory_type` po podtypie przedmiotu), z jaką wagą wypada każdy poziom (`a_prob`; poziom z wagą 0 nie wypada)
i jaką ma wartość (`a_level`). Np. pierścień (podtyp 4) może dostać opcje ataku i celności, kamień (podtyp 1) —
Strength/Dexterity/Intelligence/Constitution, obronę i unik. **Własne:** liczba opcji przy zakupie 1–5 (wagi
40/30/18/9/3), typy wybierane równo spośród pasujących, i to, co opcja robi w IdleLC (`OPTION_EFFECTS`):
Strength → atak Titana i Knighta, Dexterity → Healera i Rogue, Intelligence → Mage i Sorcerera, Constitution →
+5 HP za punkt, ataki fizyczne/magiczne/wręcz/dystansowe → atak klas, których dotyczą, obrony → obrona, celność
i unik w 1/10 %. Opcje żywiołów (26–35) i specjalne nie wypadają, dopóki nie ma żywiołów. Opcja bez działania dla
klasy jest w UI przekreślona. Akcesoriów nie ma w sklepach ani dropie w bazie — sprzedaje je sklep IdleLC po
cenie z bazy (decyzja własna).

**Sklep (kupno)** — przycisk Shop w panelu polowania:

- **broń i zbroje klasy**: dla każdego slotu poprzedni, obecny i następny próg (`tierWindow`) z głównej linii
  przedmiotów w bazie (zwykłe przedmioty, flaga ulepszania, cena ≥ 100, najczęstsza cena w progu; bez poziomu 1 —
  każdy ma zestaw startowy). Broń co 4 poziomy, zbroja co 5;
- **akcesoria** z losowymi opcjami;
- **towary** sklepów NPC strefy (`t_shopitem`): kamienie (mikstury — gdy dojdzie ich użycie w walce).

Cena = `a_price × a_buy_rate %` (100%).

## Pasek umiejętności

Najwyżej **7** umiejętności na pasku (`skillBar`), i tylko one są używane w walce (jak szybki pasek LC przy
auto-polowaniu). Ułożenie: ataki i klątwy z lewej, buffy i leczenie z prawej. Nowa aktywna umiejętność trafia
na pasek, jeśli jest miejsce; w oknie Skills: „Add to bar” / „Remove from bar”.

## Sklep (sprzedaż przedmiotów)

Sklep płaci `t_item.a_price × t_shop.a_sell_rate %`, w dół do pełnej sztuki złota. We wszystkich 65 sklepach
LC `a_sell_rate = 40`, a `a_buy_rate = 100` (to, ile płaci gracz przy kupnie). Przykład: Fox Tail (cena 26)
→ 10 złota; broń poziomu 5 (cena 1 066) → 426 złota. Przedmioty z ceną 0 nie są skupowane.
Znaczenie obu kolumn potwierdzi kod serwera.

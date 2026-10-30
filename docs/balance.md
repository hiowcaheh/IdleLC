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
(`hpRegen` / `mpRegen` — wartość z bazy na 5 s, nasze odczytanie) i z mikstur (patrz „Mikstury”). Po śmierci
postać wstaje z pełnym HP i MP, a buffy i działające mikstury znikają.

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

**Akcesoria** (decyzja właściciela: wypadają z potworów, sklep ich nie sprzedaje; reguła **własna**): każde zabicie
ma **0,5%** szansy na zwykłe akcesorium (`ACCESSORY_DROP_CHANCE`, `loot.ts`), podzielone między 10 akcesoriów
proporcjonalnie do 1 / ceny (tańsze częściej). Akcesorium trafia do torby jako osobna sztuka z wylosowanymi
opcjami (1–5), także z wypraw AFK.

Sprzęt, którego nie może nosić żadna z 6 klas IdleLC (w bazie: Night Shadow, `a_job_flag` 64), **nie
wypada** — wpisy takich przedmiotów są pomijane w tabelach dropu (decyzja właściciela, `monsters.ts`).

## AFK — wyprawy

- Powrót z wyprawy nie odnawia HP i MP: postać ma ich tyle (proporcjonalnie), ile przed wyprawą, plus
  regeneracja poza walką za czas nieobecności (`carryVitals`).

- Gracz wysyła postać na **wyprawę** (przycisk „Expedition” w panelu polowania). Postać poluje na wybranego
  potwora, a walka na ekranie staje. Start zapisuje czas (`expedition.startedAt`); wyprawa przetrwa
  zamknięcie gry.
- Powrót („Return now”) płaci `min(teraz − start, 8 h)`; wyprawa krótsza niż 1 min nie daje nic. Bez wyprawy
  czas poza grą nie daje nagród (aktywna gra albo wyprawa — jak w opisie M4).
- Tempo polowania mierzymy na **prawdziwej symulacji walki** (`measureHuntRate`: 20 minut walki tymi samymi
  wzorami co na ekranie) osobno dla każdego poziomu postaci. Czas wyprawy dzielimy na 10-minutowe odcinki,
  więc awans w trakcie wyprawy wzmacnia postać. Wynik: zabicia (z losowym zaokrągleniem), śmierci, exp,
  złoto, SP i drop jak za zwykłe zabicia. Symulacja używa nauczonych umiejętności postaci. `AFK_EFFICIENCY = 1` (wartość własna: wyprawa daje tyle co gra przy
  włączonym ekranie). Okno przed wysłaniem pokazuje oczekiwane zabicia, exp, złoto i mikstury na godzinę.
- **Mikstury na wyprawie**: pomiar tempa daje postaci tyle mikstur z torby, ile chce, i liczy, ile wypiła na
  godzinę; każdy 10-minutowy odcinek zabiera z torby tyle sztuk (najwyżej tyle, ile zostało). Gdy rodzaj się
  skończy, tempo jest mierzone od nowa bez niego. Zużyte mikstury są w oknie „While you were away…”.
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
  wystrzeleniu — postać nie stoi w tym czasie (`TIMINGS.skillAnimationLock = 0`) i rusza dalej po zwykłym
  interwale ataku; klipy skilli z klienta (`skills.lod`) są dopasowane do tego rytmu: przygotowanie czaru
  trwa tyle, co rzucanie, a wystrzał trafia w chwili ciosu (tempo klipu ×0,5…×2,5). Odnowienie
  `max(przygotowanie, a_reuseTime / 10)` liczone od początku rzucania, efekty trwają `a_durtime / 10` s.
- **Efekty** (`t_magic` typ/podtyp):
  - typ 3 — obrażenia: cios × `1 + power/100`;
  - typ 0 — zmiana statystyki: 0 atak, 1 obrona, 2 atak magiczny → atak, 3 obrona magiczna → obrona, 4 celność,
    5 unik, 6 szansa krytyka (power/10 %), 7 i 23 szybkość ataku, 8 czas rzucania, 10/11 regeneracja HP/MP,
    12/13 maks. HP/MP, 14 obrażenia krytyczne (power %), 22 atak %; `a_damagetype` 2 = procent;
  - typ 2 — stany: 2, 5, 7 ogłuszenie (power > 0 = szansa %), 16 spowolnienie ataku, 9 / 10 HP / MP na
    sekundę przez czas trwania (te same stany mają mikstury leczenia i many; np. Mana Recovery maga),
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
- **Wymagany sprzęt** (1:1 z `t_skill`): aktywna umiejętność działa tylko z bronią swojego rodzaju
  (`a_useWeaponType0/1` = `t_item.a_subtype_idx`, np. rycerz: miecz 0 lub podwójne miecze 11), z bronią
  w ogóle, gdy `a_useState` ma bit 2, i z tarczą, gdy ma bit 16 (Shield Strike). Pasywne — według
  `a_appWeaponType0/1` i `a_appState`. Rodzaj broni sprawdzamy, gdy jakaś jest założona. Pozostałe bity stanu
  (siedzenie — Quick Recovery, śmierć celu — Resurrection) pomijamy. Umiejętność bez wymaganego sprzętu nie
  jest używana ani w walce, ani na wyprawie (szara na pasku, opis w oknie Skills).
- **Podwójne miecze zajmują obie ręce** (reguła właściciela; baza nie ma takiej flagi): założenie ich
  odkłada tarczę do torby, a tarczy nie da się założyć do podwójnych mieczy.

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

**Ulepszanie +0…+15** (okno Character): zużywa jeden **Heaven Stone** (`t_item` 85, sprzedawany w Juno za
1 000) — tylko on ulepsza (decyzja właściciela). Szansa z +N (własne, poprawione 2026-10-30 na prośbę
właściciela — „+10 ma być osiągalne”): 100, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35%. Porażka
od +10 zabiera jeden „+”, niżej tylko kamień. Średnio ok. 13 kamieni do +10, 21 do +12, 76 do +15 (wcześniej
77 do +10 i ~58 000 do +15). Każdy „+” = +10% mocy przedmiotu.
Smelting Stone (84) w LC wypada z potworów według zasady serwera, której nie ma w bazie — u nas **1% na zabicie
każdego potwora** (`GENERAL_DROPS`, własne). W torbie **10 Smelting Stone wymienia się na 1 Heaven Stone**
(`exchangeStones`, decyzja właściciela). Poziom kamienia z LC („do przedmiotów tego samego poziomu”) pomijamy.

Ulepszać można tylko przedmioty z flagą ulepszania (`t_item.a_flag` bit 2) — broń i zbroje tak, akcesoria nie.

**Akcesoria i opcje.** Trzy sloty na akcesoria (`a_wearing` 7). Zwykłe akcesoria z bazy („Magical Accessory”:
sznury, kamienie, oczy, kolczyki, pierścienie) nie mają własnych statystyk — całą ich moc dają **opcje**
(`t_option`, 1:1): na jakim przedmiocie opcja może się pojawić (maski `a_weapon_type` / `a_wear_type` /
`a_accessory_type` po podtypie przedmiotu), z jaką wagą wypada każdy poziom (`a_prob`; poziom z wagą 0 nie wypada)
i jaką ma wartość (`a_level`). Np. pierścień (podtyp 4) może dostać opcje ataku i celności, kamień (podtyp 1) —
Strength/Dexterity/Intelligence/Constitution, obronę i unik. **Własne:** liczba opcji przy dropie 1–5 (wagi
40/30/18/9/3), typy wybierane równo spośród pasujących, i to, co opcja robi w IdleLC (`OPTION_EFFECTS`):
Strength → atak Titana i Knighta, Dexterity → Healera i Rogue, Intelligence → Mage i Sorcerera, Constitution →
+5 HP za punkt, ataki fizyczne/magiczne/wręcz/dystansowe → atak klas, których dotyczą, obrony → obrona, celność
i unik w 1/10 %. Opcje żywiołów (26–35) i specjalne nie wypadają, dopóki nie ma żywiołów. Opcja bez działania dla
klasy jest w UI przekreślona. Akcesoriów nie ma w sklepach ani dropie w bazie — sprzedaje je sklep IdleLC po
cenie z bazy (decyzja własna).

**Sklep (kupno)** — przycisk Shop w panelu polowania:

- **broń i zbroje klasy**: dla każdego slotu poprzedni, obecny i następny próg (`tierWindow`) z głównej linii
  przedmiotów w bazie (zwykłe przedmioty, flaga ulepszania, cena > 100 — eventowy zestaw Phoenix z 50 poz. za 100
  złota nie jest w sklepie, decyzja właściciela; najczęstsza cena w progu; bez poziomu 1 —
  każdy ma zestaw startowy), w każdym progu **jeden, najsłabszy** przedmiot (najmniej ataku / obrony; prośba
  właściciela — bez duplikatów i mocniejszych odmian). Broń co 4 poziomy, zbroja co 5;
- **towary** sklepów NPC strefy (`t_shopitem`): mikstury i kamienie (Heaven Stone), plus lupy.

Cena = `a_price × a_buy_rate %` (100%).

## Rzadkie przedmioty i lupy

**Zasada właściciela (2026-10-30):** rzadkie przedmioty od 77 poziomu mogą dostać zestawy specjalne swojego
slotu (ocena A, z wagą, jaką mają w bazie na innych przedmiotach): hełmy **Casting-Up** (53, skrócenie
odnowienia skilli, waga 250), zbroje i spodnie **Anti-Stun / Anti-Silence / Anti-Stone** (56, 57, 60 —
odporności, po 125), buty **Speed-Up** (59, szybkość ruchu, 250). Np. Reidon Helm: 250 / 10 250 ≈ 2,4% na
identyfikację (`SPECIAL_RARE_SETS` w `import-db.mjs`).

Dane 1:1 z bazy:

- `t_item.a_rare_index_N` / `a_rare_prob_N` — które zestawy `t_rareoption` przedmiot może dostać i z jaką wagą
  (np. Perion Sword 73: Mighty — E 60%, Razing — D 30%, Destructive — C 10%). Rzadkie są bronie i zbroje od
  ok. 70 poz. (Ignis 70–72, bronie 73, rękawice 75, spodnie i zbroja 76, hełm i buty 77…).
- `t_rareoption` — klasa (`a_grade` 0 = A … 4 = E), typ (broń / zbroja / akcesorium), prefiks nazwy
  („Mighty Perion Sword”), stałe premie (`a_attack`, `a_defense`, `a_magic`, `a_resist`) i do 10 opcji, każda
  z poziomem i szansą `a_option_prob` (na 10 000).
- Lupy: Magnifying glass (1838, 600 000) i Golden magnifying glass (1839, 1 000 000 — „zawsze działa”).

Zasady:

- rzadki przedmiot spada (i jest sprzedawany) **nieodkryty** — czerwona nazwa, leży w stosie; można go założyć
  i działa jak zwykły, bez opcji (decyzja właściciela);
- odkrycie u **Appraisera** (przycisk w panelu polowania) zużywa jedną lupę na sztukę: losuje zestaw z wag
  przedmiotu, potem każdą opcję zestawu z jej szansą. Zwykła lupa działa w **60%** przypadków (własne —
  cena za sukces jak złotej), przy porażce lupa przepada, przedmiot zostaje nieodkryty;
- premie zestawu dodają się do mocy przedmiotu (broń: atak + magia, zbroja: obrona + odporność), ulepszenia
  „+” liczą się od sumy;
- kolory nazw (decyzja właściciela): nieodkryty czerwony, **A niebieski, B zielony, C jasnoniebieski,
  D żółty, E biały**;
- Appraiser odkrywa hurtem (tyle sztuk, na ile starczy lup), pokazuje odkryte od najlepszych (klasa, liczba
  i siła opcji, poziom), zaznacza je klasami („E ×5”) i sprzedaje zaznaczone (`a_price × 40%`);
- lupy sprzedaje sklep w każdej strefie (własne — w LC są w sklepach miast).

Opcje specjalne zestawów (działanie **własne**): skrócenie odnowienia skilli (58, max −50%), mniej many na
skille (59, max −75%), kradzież HP / MP z obrażeń (24, 25, 51, 52), szybkość ruchu (64 — krótsze podbieganie
do potwora, więc więcej zabić na godzinę), blok (63 → unik w punktach %), szansa krytyka (55, w 1/10 %),
obrażenia krytyczne (66, %), regeneracja HP / MP (50, 56, 57), niższy wymagany poziom (49). Odporności (60–62),
lot (65), ataki ciemności / trucizny (53, 54) i przemiana (84) są wyświetlane, ale jeszcze nie działają.

## Opcje z gry (zwykły sprzęt)

Decyzja właściciela: broń i zbroja **nigdy nie spadają z opcjami**. Za każde **10 minut aktywnej gry**
(walka na ekranie; wyprawy się nie liczą) losowa założona część, która nie jest rzadka i ma mniej niż 5 opcji,
dostaje jedną nową opcję — losowy typ z `t_option` dozwolony dla jej podtypu (maski) i jeszcze nieobecny,
poziom według wag `a_prob`. Akcesoria też mogą dostać opcję. Czas liczy serwis przy zgłoszeniach walki:
odstęp między zgłoszeniami, najwyżej 2 minuty (dłuższa przerwa = gra była zamknięta). Gdy żadna część nie
może dostać opcji, licznik czeka pełny. W karcie postaci (Stats) widać, za ile minut następna opcja.

## Mapa świata

Każda z 9 stref z bazy da się wybrać od razu (prośba właściciela — bez blokady poziomu). Mapa pokazuje
najniższy i najwyższy poziom spotów strefy i ile z nich jest otwartych. Po wyborze postać idzie na najdalszy
otwarty spot strefy (nowa strefa: pierwszy spot).

## Tytuły

- Dane 1:1 z `t_title` (włączone, z angielską nazwą przedmiotu — 184): nazwa i opis z przedmiotu tytułu
  (`t_item.a_name_usa` / `a_descr_usa`), czas `a_time` w dniach (-1 = na stałe), kolor napisu `a_color`
  i drugi kolor `a_bgcolor` (u nas poświata napisu), do 5 opcji `t_option` (`a_option_index/level`).
- Przedmiot tytułu (typ Other) → „Use” w torbie dodaje tytuł na jego czas; ponowne użycie przedłuża czas
  (dni dodają się); tytuł stały drugi raz — odmowa. Pierwszy tytuł zakłada się sam (**własne**).
- Założony jest jeden tytuł; jego opcje działają jak opcje sprzętu. Czas płynie realnie (także na wyprawie
  i z zamkniętą grą); po końcu tytuł znika i spada z postaci.
- Skąd gracz dostaje przedmioty tytułów — **decyzja właściciela** (na razie tylko narzędzie dev).

## Księga potworów — nagrody

Za 10 / 100 / 1 000 / 10 000 zabić danego potwora (`BOOK_MILESTONES`) gracz odbiera nagrodę w księdze (po
kolei, przycisk Claim). Na razie każdy potwór daje Heaven Stone: 1 / 2 / 5 / 10 (ilości **własne**, prośba
właściciela: „na razie Heaven Stone”); nagrody poszczególnych potworów ustawi właściciel
(`MONSTER_REWARDS` w `data/bookRewards.ts`).

## Spoty (własne)

- Spoty strefy to jej potwory w kolejności: poziom, zwykłe przed elitami, mniej HP i ataku przed silniejszymi
  (`zones.ts`). Bez potworów eventowych i bossów rajdowych (`EVENT_MONSTERS`, `RAID_BOSSES`).
- Na start otwarty jest tylko pierwszy spot strefy; zabicie (w walce albo na wyprawie) potwora najdalszego
  otwartego spotu otwiera kolejny (`logic/spots.ts`). Podróż do zamkniętego spotu serwis odrzuca (`spot-locked`).
- Czas gry: suma przerw między raportami walki, każda najwyżej `MAX_PLAY_GAP` (120 s); wyprawa się nie liczy.
  Wyprawa liczy się do statystyki, gdy trwała co najmniej `AFK_MIN_SECONDS`.
- Heaven Stone w każdym sklepie po cenie z bazy (1 000) — tymczasowo, na prośbę właściciela.

## Mikstury

Dane 1:1 z bazy: mikstura w LC to umiejętność (`t_item.a_num_0` → `t_skill`): stan z `t_magic` i moc
z `t_magiclevel` (typ 2 podtyp 9 / 10 — HP / MP na sekundę; typ 0 podtyp 10 / 11 — regeneracja HP / MP),
czas trwania `a_durtime / 10` s, odnowienie `a_reuseTime / 10` s. Przykłady: Small Healing Potion 16 HP/s
przez 15 s (240 HP), Small Mana Potion 8 MP/s przez 15 s, Small HP Recovery Potion regeneracja HP +2 przez
10 min, Platinum (od 60 poz.) z odnowieniem 25 s. Kupno w sklepie strefy (Juno), cena `a_price`.

Picie (zasady **własne**, `src/game/logic/combat.ts`):

- tylko w walce, sam z siebie, tylko mikstury ze slotów HP i MP (gracz wybiera je z torby — slot HP:
  leczenie lub regeneracja HP, slot MP: mana lub regeneracja MP), jeśli postać ma do nich poziom;
  nie pije ogłuszona;
- leczenie, gdy HP < **50%**; mana, gdy MP < **30%**; regeneracja HP / MP, gdy HP / MP nie jest pełne;
- naraz działa jedna mikstura danego rodzaju, a po wypiciu rodzaj czeka na odnowienie (`a_reuseTime`);
- przełączniki AUTO slotów: wyłączone — postać nie pije mikstury ze slotu (także na wyprawie);
- zapis v9 przeniósł starsze postacie: do slotu trafiła mikstura danego rodzaju, której torba ma najwięcej;
- gracz może też wypić miksturę ręcznie z torby (Inventory → mikstura → Drink, `drinkPotion`): przy dowolnym
  HP / MP i także spoza slotów, ale z tymi samymi zasadami odnowienia i „jedna naraz” (nie w czasie wyprawy).

Zużycie liczy walka w przeglądarce, a serwis zdejmuje mikstury z torby przy zgłoszeniu walki
(`reportCombat`, pole `potions`, najwyżej tyle, ile jest w torbie). Zgłoszenie idzie po każdej walce, przy
wysłaniu na wyprawę i przy wyjściu z gry.

## Pasek umiejętności

Najwyżej **7** umiejętności na pasku (`skillBar`), i tylko one są używane w walce (jak szybki pasek LC przy
auto-polowaniu). Ułożenie: ataki i klątwy z lewej, buffy i leczenie z prawej. Nowa aktywna umiejętność trafia
na pasek, jeśli jest miejsce; w oknie Skills: „Add to bar” / „Remove from bar”.

## Sklep (sprzedaż przedmiotów)

Sklep płaci `t_item.a_price × t_shop.a_sell_rate %`, w dół do pełnej sztuki złota. We wszystkich 65 sklepach
LC `a_sell_rate = 40`, a `a_buy_rate = 100` (to, ile płaci gracz przy kupnie). Przykład: Fox Tail (cena 26)
→ 10 złota; broń poziomu 5 (cena 1 066) → 426 złota. Przedmioty z ceną 0 nie są skupowane — poza bronią i zbroją, które sklep bierze za co najmniej 1 złoto
(decyzja właściciela: da się sprzedać zestaw startowy).
Znaczenie obu kolumn potwierdzi kod serwera.

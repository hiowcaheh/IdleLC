# Balans — wzory

Wzory są w `src/game/logic/` (`balance.ts`, `ratings.ts`, `attributes.ts`, `options.ts`,
`skills.ts`), a czasy faz walki w `combat.ts` (`TIMINGS`). Zmiana wzoru wymaga aktualizacji
kodu, tego dokumentu i odpowiednich testów logiki.

> Aktualizacja po audycie `a35cfbb`: źródłowe HP/MP i kanały arkusza sterują walką.
> Wyprawa jest ciągłą symulacją z ograniczonym zapasem mikstur. Nie jest to jeszcze
> pełny port GameServer: obecny eksport nie zawiera atrybutów NPC, magic avoid,
> hitrate i pełnych slotów dropu. Zakres oraz jawne blokady:
> [naprawy po audycie](audit-fixes.md).

## Statystyki

Od 2026-11-03 każda klasa bez profesji dostaje 1 rozdawany punkt za awans.
Pula to `level − 1 − suma(allocatedStats)`, a poziom 1 zaczyna z zerem. Pula wynika
z poziomu, więc obejmuje jednoczesne awanse i AFK bez osobnego, powielanego kredytu.
Rozdanie zwiększa źródłowy atrybut, HP/MP według współczynników klasy, właściwy kanał
arkusza używany również w walce. Magiczna broń używa INT; łuk używa DEX.
Procentowe opcje używają podstaw
uwzględniających rozdane punkty. SaveVersion 14 sanitizuje liczby i ogranicza sumę do
zdobytej puli. W trakcie ekspedycji rozdawanie jest zablokowane.

Stun, Stone i Silence resistance są niezależnymi sumami opcji 61, 60 i 62,
z limitem 80% dla każdej. Stun/Stone zmniejsza szansę na istniejące ogłuszenie /
petryfikację mnożnikiem `(1 − resistance/100)`. Silence blokuje rzucanie skilli,
stone i stun blokują działania, hold ruch, confusion jest osobnym stanem bez stuna.
Nie wyznaczamy szansy stanu z jego mocy; brakujące `hitrate` blokuje nową naukę.

Ruch: `czas = bazowyCzas × 6 / runSpeed` dla podróży (`TIMINGS.travel`) i podejścia
(`TIMINGS.approach`). `runSpeed` uwzględnia klasę, sprzęt i efekty; scena i symulacja
używają wspólnego czasu. Bez źródłowego arkusza używa się `6 × (1 + moveSpeed/100)`.

Character grupuje atrybuty, HP/MP, walkę, bonusy, szybkości i regenerację. Nowy arkusz
`CombatStats.client` ma osobne physical/magic attack, defense, hit i evasion,
critical/deadly rating oraz prędkości źródłowe. Character pokazuje tylko run m/s; walk speed jest ukryte.
Wybrany kanał ataku i oba kanały obrony są wiązane z walką. Szczegóły i granice:
[uzupełnienie źródłowe](source-followup-fixes.md). Magiczne i fizyczne opcje/buffy
zmieniają odpowiednie pola, a critical/deadly są ponownie liczone po zmianie DEX.

| Statystyka       | Opis                                           |
| ---------------- | ---------------------------------------------- |
| `maxHp`          | maksymalne zdrowie                             |
| `attack`         | atak                                           |
| `defense`        | obrona                                         |
| `attackInterval` | sekundy między kolejnymi atakami               |
| `critChance`     | szansa na cios krytyczny (0–1), gdy cios trafi |
| `critMultiplier` | mnożnik obrażeń przy krytyku                   |
| `maxMp`          | mana na umiejętności (potwory nie mają)        |

`hit` / `dodge` to surowe punkty ratingu, z bazą klasy i przyrostem poziomowym, opcjami
i efektami umiejętności. `strength` / `dexterity` / `intelligence` / `constitution` są
atrybutami źródłowych klas bez profesji. `hpRegen` / `mpRegen` to dodatki HP/MP na 3 s,
`castSpeed` skraca przygotowanie castu (STAT23), `reuseTime` zmienia odnowienie (STAT8),
a `blockChance` to procent szansy połowienia zwykłego ciosu.

### Statystyki klasy na poziomie

`attributes.ts` przenosi bazowe atrybuty, ich przyrosty oraz współczynniki HP/MP
z `PC.cpp:58–138`. Zasoby: baza + przyrost × (poziom − 1), następnie wpływ
rozdanych punktów, opcji i pasywnych efektów.

| Klasa    | HP na 1 | HP/poziom | MP na 1 | MP/poziom |
| -------- | ------: | --------: | ------: | --------: |
| Titan    |     180 |        36 |      68 |        14 |
| Knight   |     150 |        30 |      86 |        16 |
| Healer   |     110 |        18 |     108 |        22 |
| Mage     |      90 |        11 |     122 |        31 |
| Rogue    |     130 |        27 |      56 |         9 |
| Sorcerer |     110 |        15 |     128 |        29 |

Atak/obrona pochodzą z atrybutu i rzeczywistych wartości sprzętu (`clientStats.ts`),
bez skalowania do mediany potworów lub typowego sprzętu. Broń wyznacza interwał;
bez broni wynosi on 1,2 s. Krytyk zastępczy pozostaje do czasu odzyskania danych NPC.
Poziom jest ograniczony do 1–100; dostępne są Juno, Dratan, Merac i Egeha.

## Trafienie

```
różnica = poziomAtakującego − poziomBroniącego
H = max(0, hitAtakującego + różnica)
A = max(0, dodgeBroniącego − różnica × avoidPerLevelBroniącego)
trafienie = U(1, trunc(1000 × H)) > U(1, trunc(1000 × A))
```

Losowania są niezależne i całkowite; remis oznacza pudło. `avoidPerLevel` wynosi 10
dla postaci i 1 dla NPC. Knight 20 ma 168 hit, opcja 21 poziomu 4 dodaje 75, razem 243.
Zerowy H oznacza pudło; dodatni H przy zerowym A oznacza trafienie. To adapter jednego
kanału ratingów, bez pełnego `CalcNewHitProb`, profesji i wszystkich wyjątków PvP.

## Obrażenia

`sourceSkillDamage` rozdziela składnik atrybutu i broni, fizyczną obronę i resist.
Zwykły atak PC używa tych samych kanałów co arkusz. `MDT_ONLYPOWER` zwraca moc;
`MDT_ADDITION` dodaje ją do składnika broni po źródłowym mnożniku poziomu,
przed korektą hit/avoid i odjęciem obrony. Nie zamienia się mocy 500 na +500%.
Zachowano źródłową gałąź RATE, bez dopisywania nieobecnego w niej mnożnika.

To gałęzie solo bez profesji. Brakuje kompletnego `CalcNewHitProb`, atrybutów,
magic avoid i attack type wszystkich NPC oraz regionalnych wyjątków. Dla NPC
i syntetycznych testów bez tych danych pozostaje jawny adapter `A²/(A+D)`.
Nie jest on przedstawiany jako oryginalny wzór serwera.

`sourceHitTypes.ts` przenosi sześć osobnych rzutów WEAK/NORMAL/STRONG/HARD/CRITICAL/DEADLY
i wygrywanie remisów przez późniejszy typ. Wymaga rzeczywistego CON celu;
bez niego nie podstawia zmyślonej wartości. STAT14/66 nie zwiększają już obrażeń
krytycznych. Pełne włączenie Deadly dla obecnych NPC czeka na SQL; nowa nauka
takich pasywnych skilli jest w tym czasie zablokowana.

Opcja 63 niezależnie losuje blok zwykłego ciosu: `max(1, trunc(obrażenia / 2))`.
Ataki umiejętnościami pomijają ten blok.

## Regeneracja

Naturalny odzysk PC ma niezależny impuls **3 s**. Podczas ruchu i trybu walki baza
wynosi 1 HP/MP, podczas stania bez siedzenia 25% odzysku klasy, z obcięciem.
Następnie liczą się kolejno pasywne efekty, assisty i opcje (`PC.cpp:2408`).
Same premie +2 dodają 10 jednostek przez 15 s, zamiast dawnych 6.
Leczenie mikstur i assistów jest osobną mechaniką. Własny powrót z AFK nadal
używa proporcji HP/MP sprzed wyprawy; nie zapisujemy trwałego stanu walki.
Po śmierci postać wstaje z pełnymi zasobami, a efekty znikają.

## Przebieg walki (czasy)

Zmiana spotu: faza **traveling** (`TIMINGS.travel` = 2,5 s, własne) — potwór znika, postać biegnie do nowego
spotu (na Juno teren mapy przesuwa się z jednego miejsca walki do drugiego, w innych strefach podłoże przesuwa
się pod postacią), potem zwykłe `spawning`. W tym czasie nie ma walki ani zabić.

| Faza       | Czas  | Co się dzieje                                            |
| ---------- | ----- | -------------------------------------------------------- |
| `spawning` | 0,5 s | pokonany potwór zapada się, pojawia się nowy (pełne HP)  |
| `approach` | 1,3 s | gracz podbiega do potwora                                |
| `fighting` | —     | wymiana ciosów aż ktoś zginie                            |
| `victory`  | 1,2 s | animacja śmierci potwora (bez pozy zwycięstwa gracza)    |
| `defeat`   | 3,0 s | gracz leży, potem wstaje z pełnym HP i szuka nowego celu |

- Gracz atakuje pierwszy. Potwór zaczyna po połowie swojego interwału.
- Cios trafia **0,4 s po rozpoczęciu zamachu** (`impactDelay`). Animacja ataku jest
  dopasowywana do tego czasu niezależnie od modelu.
- Gdy ktoś zginie, jego rozpoczęty cios przepada.

## Dawny adapter statystyk

`lcBalance.ts` zachowano jako historyczny model porównawczy i fixture testowe.
`playerFighter` nie skaluje już HP/ATK/DEF do mediany potworów. `applyGear` z
referencyjnymi współczynnikami pozostaje starszym narzędziem testowym; główna
postać używa kanałów `clientStats.ts` i rzeczywistych `pieceStats`.

## Doświadczenie i nagrody

- **Exp na poziom** — `t_exp` z bazy 1:1 (`src/game/data/progression.ts`): `EXP_TABLE[poziom − 1]` to exp
  potrzebny z poziomu `poziom` na następny (1 → 34, 10 → 18 748, 30 → 4 046 233). Nadmiar przechodzi na
  kolejny poziom; jedna nagroda może dać kilka poziomów. Na poziomie 100 exp się nie zbiera. Bez danych LC
  działa zastępcza krzywa `30 × poziom^2,2`.
- **Nagroda za zabicie** — bazą są `t_npc.a_exp`, `a_skill_point` i `a_prize`.
  `rewards.ts` / `pveLevels.ts` stosują źródłowe reguły solo. EXP przy przewadze
  postaci 1/2/3/4/5/≥6 poziomów daje 95/90/75/60/45/10% bazy. SP traci 10 pp
  za poziom przewagi, do 0% przy +10. Następnie EXP i SP niezależnie losują
  całkowite ±10% z obcięciem do zera; minimum wynosi 1 EXP i 1 jednostkę SP.
  Opcje sprzętu i aktywnego, niewygasłego tytułu 82/83 dodają procent EXP/SP:
  `nagroda + trunc(nagroda × sumaProcentów / 100)`, osobno na zabójstwo.
  Nas wypada z szansą 80% − 5 pp za każdy poziom przewagi postaci, minimum 0%;
  po sukcesie ilość wynosi `trunc(a_prize × randomInt(50,150) / 100)`.
  Aktywna walka i AFK losują każde zabójstwo i przeliczają kary po awansie.
  Estymacja godzinowa używa dokładnej średniej losowań. Nie dodano party, eventów
  ani strat po śmierci. Szczegóły: [reguły PvE](pve-dratan-fixes.md).
- **Limit zabić** — przeglądarka tylko pokazuje walkę i zgłasza jej wynik (`reportCombat`). Serwis płaci
  za najwyżej `floor(czas od poprzedniego zgłoszenia × prędkość gry / MIN_KILL_CYCLE) + 2` zabić.
  Obecnie minimum to 1,7 s (1,2 s zwycięstwa + 0,5 s na nowego potwora). Prędkość gry > 1 jest tylko w narzędziach dev;
  na serwerze (Supabase) zawsze 1. Patrz [`docs/supabase.md`](supabase.md).

## Drop

Przedmioty mogą wypaść, gdy postać przewyższa potwora najwyżej o 5 poziomów.
Od przewagi 6 poziomów wypłata pomija wszystkie obecne kill-dropy, także dodatkowe
akcesoria i Smelting Stone. Gdy import ma komplet `dropSlots`, silnik wykonuje
cztery wybory indeksu 0…19 i osobno test szansy wybranego slotu. Puste sloty zostają,
a ten sam przedmiot może wypaść wielokrotnie. Obecny stary eksport nie ma tej tabeli:
do czasu odzyskania SQL zachowuje wcześniejsze losowania osobnych wpisów. Nie
odtwarzamy brakujących pozycji z listy dodatnich dropów. Eventy i drop z „+” nie są portowane.
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
- Powrót („Return now”) płaci `min(teraz − start, 8 h)`; liczy się każda pełna sekunda wyprawy, również przed pierwszą minutą. Bez wyprawy
  czas poza grą nie daje nagród (aktywna gra albo wyprawa — jak w opisie M4).
- Wypłatę liczy ciągły `combatTick`, krokiem do 0,05 s, z oddzielnym RNG walki
  i nagród. Każde zabójstwo ma własny czas, nagrodę i granicę awansu. HP/MP, efekty
  i cooldowny są zachowywane między walkami, bez restartu co 600 s.
- Mikstury mają rzeczywisty skończony zapas. Ostatnia sztuka kończy się w chwili
  użycia; dalsza walka przebiega bez niej. Drop mikstur do aktywnego slotu może
  uzupełnić zapas. Zużycie trafia do podsumowania.
- Tytuł liczy się do chwili wygaśnięcia. Trwająca wyprawa zachowuje jego historię
  przez zapis i odświeżenie; dopiero odbiór usuwa wygasły tytuł.
- `measureHuntRate` nadal jest próbką 1200 s z pełnym zapasem do **podglądu**
  wydajności „while they last”. Nie służy do wypłaty AFK. `AFK_EFFICIENCY = 1`.
- Jedno zgłoszenie walki obejmuje najwyżej 10 minut (`MAX_REPORT_WINDOW`), więc czas poza grą może zapłacić
  tylko wyprawa.

## Umiejętności

Dane 1:1 z bazy: `t_skill` (klasa, typ, cel, czasy w 1/10 s), `t_skilllevel` (mana, HP, czas trwania,
wymagany poziom postaci, koszt SP, wymagane inne umiejętności) i `t_magic` + `t_magiclevel` (efekty i ich moc).
Interpretację przenosimy według kodu serwera; niepełne efekty i brakujące szanse nie pozwalają wydać nowych SP. Pełna lista ograniczeń jest w [raporcie](audit-fixes.md).

- **SP** — baza za zabicie `t_npc.a_skill_point`, liczone jak na serwerze LC w 1/10 000 punktu (Fox: 1375 →
  0,1375 SP). Nauka kolejnego poziomu kosztuje `a_learnSP` pełnych punktów i wymaga `a_learnLevel` oraz
  wymaganych umiejętności. Nowa postać zna 1. poziom darmowych umiejętności z poziomu 1 (np. Knuckle Spear).
  Wypłata stosuje kary, losowanie i bonusy opisane wyżej; źródłowe minimum to 0,0001 SP.
- **Czasy** — `a_readyTime / 10` s to przygotowanie (np. czarowanie maga, 0 dla większości ataków; skraca je
  „Fast Spell Casting”), potem skill trafia jak zwykły cios (+0,4 s). `a_fireTime` to w LC animacja **po**
  wystrzeleniu — postać nie stoi w tym czasie (`TIMINGS.skillAnimationLock = 0`) i rusza dalej po zwykłym
  interwale ataku; klipy skilli z klienta (`skills.lod`) są dopasowane do tego rytmu: przygotowanie czaru
  trwa tyle, co rzucanie, a wystrzał trafia w chwili ciosu (tempo klipu ×0,5…×2,5). Odnowienie
  liczone od początku rzucania: `p = a_reuseTime + magicSpeed`,
  `p *= 150/(150+bonus) * 100/(100+bonus)`, wynik w górę do impulsu 0,1 s.
  Jeśli p < 1, źródło ustawia 10 impulsów. Nie ma dawnego limitu 50%.
  Znane flagi guild/no-cool-time pomijają modyfikacje. Efekty trwają `a_durtime / 10` s.
- **Efekty** (`t_magic` typ/podtyp):
  - typ 3 zachowuje ONLYPOWER/ADDITION/RATE, z kanałem melee/range/magic skilla;
  - STAT14 to Deadly, a nie mnożnik krytyka; STAT22 jest HP z limitem 450;
  - ASSIST0/5 to poison/blood, 1 hold, 2 confusion, 3 stone, 4 silence, 7 stun;
  - zwykły DOT pozostawia 1 HP; wkład na PC jest redukowany według `Assist.cpp`;
  - ASSIST13 rozlicza MP_CANCEL, wraz z anulowaniem całego buffa po braku many;
  - CURE0 usuwa poison, zachowując krwawienie;
  - nie wyznaczamy szansy z `power`. Brak `hitrate` pozostaje brakiem;
  - częściowo obsługiwany skill nie może pobierać nowych SP. Zapisane poziomy
    pozostają, a wykonują się tylko rozpoznane składniki.
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

**Jak sprzęt wpływa na walkę.** Atak fizyczny/magiczny używa właściwego
atrybutu i rzeczywistych wartości `pieceStats`, a obrona DEF/resist rzeczywistego
pancerza oraz źródłowej premii poziomu. Nie ma skalowania do `gearReference`.
Opcje są rozdzielone według kanałów; premie HP/MP liczą się według współczynników klasy.

Dla sprzętu poniżej 146. poziomu, w grze ograniczonej do +15:
`wartość = trunc(baza × f^plus)`, gdzie `f = 1,06` do +10 i `1,07` od +11.
Potęga od +11 używa nowego współczynnika dla **całego** plusa. Broń skaluje bazę
razem z płaskim rare ATK/MATK, zbroja dodaje rare DEF/MDEF po skalowaniu.
Do wyliczonej wartości dochodzą płaskie premie:

- broń od +6: +6 fizycznego albo +4 magicznego ataku, zależnie od podtypu;
- broń od +15: dodatkowo +75 fizycznego albo +50 magicznego ataku;
- zbroja poza tarczą: od +8 +10 DEF, od +10 +10 MDEF;
- wszystkie części zbroi, także tarcza: od +15 dodatkowo +100 DEF i +50 MDEF.

Źródłowy arkusz i walka używają wspólnych kanałów. Pełny port damage nadal wymaga brakujących danych NPC i wyjątków serwera.
Przykład: baza broni 100, +15 → 275 z potęgi +6 z progu +75 = 356, czyli przyrost
256 punktów. Opis przedmiotu osobno pokazuje wzrost z potęgi i podpis premii +15,
tak jak tooltip klienta. [Szczegóły i granice](client-ui-upgrade-fixes.md).

**Ulepszanie +0…+15** (okno Character): zużywa jeden **Heaven Stone** (`t_item` 85, sprzedawany w Juno za
1 000) — tylko on ulepsza (decyzja właściciela). Szansa z +N (własne, poprawione 2026-10-30 na prośbę
właściciela — „+10 ma być osiągalne”): 100, 100, 95, 90, 85, 80, 75, 70, 65, 60, 55, 50, 45, 40, 35%. Porażka
od +10 zabiera jeden „+”, niżej tylko kamień. Średnio ok. 13 kamieni do +10, 21 do +12, 76 do +15 (wcześniej
77 do +10 i ~58 000 do +15). Premie plusów są teraz źródłowe, według wzorów powyżej.
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
STR/DEX/INT/CON zmieniają odpowiednie atrybuty; wpływ STR/INT/CON na HP/MP używa
współczynników klasy z serwera. Ofensywny wpływ atrybutów pozostaje adapterem:
STR → atak Titana/Knighta, DEX → Healera/Rogue, INT → Mage/Sorcerera.
Ataki fizyczne/magiczne/wręcz/dystansowe dotyczą wybranych klas, obrony zwiększają obronę,
a hit/evasion są punktami. Opcje 67–80 używają stałych podstaw źródłowych (HP/MP:
baza klasy bez profesji), więc sprzęt i tytuł nie mnożą wzajemnie procentów. AllStats 99
stosuje wszystkie cztery atrybuty z ich wpływem na zasoby. Opcje żywiołów (26–35)
nie wypadają, dopóki nie ma żywiołów. Opcja bez działania dla
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
  „+” liczy się od sumy dla broni; rare obrona zbroi jest dodawana po potędze;
- kolory nazw (decyzja właściciela): nieodkryty czerwony, **A niebieski, B zielony, C jasnoniebieski,
  D żółty, E biały**;
- Appraiser odkrywa hurtem (tyle sztuk, na ile starczy lup), pokazuje odkryte od najlepszych (klasa, liczba
  i siła opcji, poziom), zaznacza je klasami („E ×5”) i sprzedaje zaznaczone (`a_price × 40%`);
- lupy sprzedaje sklep w każdej strefie (własne — w LC są w sklepach miast).

Opcje specjalne zestawów (działanie **własne**): bonus odnowienia skilli (58, wzór `IsReady` bez limitu 50%), mniej many na
skille (59, max −75%), kradzież HP / MP z obrażeń (24, 25, 51, 52), szybkość ruchu (64 — krótsze podbieganie
do potwora, więc więcej zabić na godzinę; kolejne bonusy mnożą prędkość), blok (63 → połowa zwykłego ciosu), szansa krytyka (55, w 1/10 %),
obrażenia krytyczne (66, %), regeneracja HP / MP (50, 56, 57), niższy wymagany poziom (49). Odporności 60–62 mają osobne wartości i limit 80%; Stun/Stone zmniejszają szansę właściwego stanu.
Lot (65), ataki ciemności / trucizny (53, 54) i przemiana (84) są wyświetlane, ale jeszcze nie działają.

## Opcje z gry (zwykły sprzęt)

Decyzja właściciela: broń i zbroja **nigdy nie spadają z opcjami**. Za każde **10 minut aktywnej gry**
(walka na ekranie; wyprawy się nie liczą) losowa założona broń lub część zbroi poniżej 73. poziomu, która nie jest rzadka i ma mniej niż 5 opcji,
dostaje jedną nową opcję — losowy typ z `t_option` dozwolony dla jej podtypu (maski) i jeszcze nieobecny,
poziom według wag `a_prob`. Akcesoria i przedmioty rare nie otrzymują opcji z upływu czasu. Czas liczy serwis przy zgłoszeniach walki:
odstęp między zgłoszeniami, najwyżej 2 minuty (dłuższa przerwa = gra była zamknięta). Gdy żadna część nie
może dostać opcji, licznik czeka pełny. W karcie postaci (Stats) widać, za ile minut następna opcja.

Po zabiciu bohater od razu idzie dalej (prośba właściciela, 2026-10-30): przerwa między potworami to
1,2 + 0,5 s zamiast 2,2 + 1,0 s, bez napisu „Looking for a target” — **własne** czasy; limit zabić w
`reportCombat` (`MIN_KILL_CYCLE`) liczy się z nich.

## Mapa świata

W grze są na razie tylko Juno, Dratan, Merac i Egeha (decyzja właściciela; `PLAYABLE_ZONES` w `zones.ts`).
Kolejna kraina wymaga pokonania ostatniego potwora poprzedniej. Mapa pokazuje
najniższy i najwyższy poziom spotów strefy i ile z nich jest otwartych. Po wyborze postać idzie na najdalszy
otwarty spot strefy (nowa strefa: pierwszy spot).

Juno i Dratan używają oryginalnego terenu i obiektów klienta. Dratan ma 11 warstw,
teren 3072×3072 m i 42 własne, bezpieczne areny odpowiadające spotom. Pozostałe
strefy zachowują dotychczasowe tło. Źródłowe kolory nazw zależą od `mob − player`:
≥6 czerwony, 3…5 żółty, −2…2 biały, −5…−3 zielony, ≤−6 niebieski.

## Tytuły

- Dane 1:1 z `t_title` (199 rekordów): nazwa i opis z przedmiotu tytułu
  (`t_item.a_name_usa` / `a_descr_usa`), czas `a_time` w dniach (-1 = na stałe), kolor napisu `a_color`
  i drugi kolor `a_bgcolor` (u nas poświata napisu), do 5 opcji `t_option` (`a_option_index/level`).
- Przedmiot tytułu (typ Other) → „Use” w torbie dodaje tytuł na jego czas; ponowne użycie przedłuża czas
  (dni dodają się); tytuł stały drugi raz — odmowa. Pierwszy tytuł zakłada się sam (**własne**).
- Założony jest jeden tytuł; jego opcje działają jak opcje sprzętu. Czas płynie realnie (także na wyprawie
  i z zamkniętą grą); po końcu tytuł znika i spada z postaci.
- Skąd gracz dostaje przedmioty tytułów — **decyzja właściciela** (na razie tylko narzędzie dev).
- Newbie: opcje 71/72 poziomu 6 dają po 10% bazowych HP/MP klasy. Knight 20 otrzymuje
  +72 HP i +39 MP do obecnego adaptera. Wygasłe tytuły są odrzucane przed obliczeniami.
- Efekty tytułów z rodziny `eff_name*` używają odzyskanych trzech emiterów dymu przy
  `CENTER`. Dotyczy to m.in. wszystkich sześciu tytułów najwyższego poziomu klasy:
  Titan `eff_nameT`, Knight `eff_nameSKY`, Healer `eff_nameGREEN`, Mage `eff_nameINDIGO`,
  Rogue `eff_nameORANGE`, Sorcerer `eff_namePURPLE`. Kolor wynika z definicji cząstek.
  Zastępczy pierścień na ziemi i gwiazdy zostały usunięte. Obsługiwane jest 16 z 24
  tytułów mających efekt; osiem innych rodzin pozostaje nieobsługiwanych.

## Efekty ulepszenia — częściowy adapter klienta

Broń i pancerz mają niezależne progi 4, 6, 8, 10, 12, 15. Dla pancerza liczy się
minimum armor/pants/gloves/boots, bez helmet i shield. `UpgradeAura.tsx` wybiera
źródłową grupę `Effect.dat`; oryginalna wróżka porusza się po odzyskanej ścieżce,
modele ring są przy tagach dłoni, a poświata śledzi geometrię broni.
Nie jest to pełny renderer cząstek/trace/legacy MDL. Importer, blending i granice
zgodności są opisane w [raporcie poprawek](fixes-2026-11-02.md).

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
- Kolejna strefa wymaga zabicia ostatniego potwora poprzedniej (Juno → Dratan → Merac → Egeha).
  Sam poziom i odblokowany spot nie zastępują zabójstwa; kontrola działa też w serwisie (`zone-locked`).
  Istniejąca postać w dalszej krainie może kontynuować polowanie i podróże wewnątrz tej krainy.
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

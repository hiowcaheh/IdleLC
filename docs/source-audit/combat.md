# Audyt walki oryginalnego Last Chaos, źródła November 2018

> Raport źródłowy z analizy 2026-11-02, porównujący stan IdleLC `c9944c9` przed wdrożeniem. Opisy „obecnie”, „bez zmian” i numery linii IdleLC dotyczą tego punktu odniesienia. Aktualny stan wdrożenia: [przekazanie prac](../development-handoff.md). Pochodzenie i prefiksy źródeł: [indeks audytu](README.md).

Stan odczytu: 2026-11-02. Oryginalny serwer: `główny katalog archiwum serwera 2018`; oryginalny klient: `główny katalog archiwum klienta 2018`. Odniesienia `GameServer/...` i `ShareLib/...` poniżej są względem katalogu serwera. Porównanie IdleLC: `główny katalog repozytorium IdleLC`, HEAD `c9944c92cacfc50595dbfc8bbd085b64cf5e4048`, czysty na początku audytu. Nie zmieniano źródeł ani repozytorium IdleLC, nie kompilowano serwera i nie uruchamiano dostarczonych programów.

## Wniosek i najważniejsze różnice

Oryginał zawiera konkretne, dostępne do przeniesienia formuły walki. Obecne `balance.ts` i `lcBalance.ts` są rzeczywiście zastępczym bilansem. Wierna podmiana wymaga jednak danych STR/DEX/INT/CON, profesji, typów ataku, oddzielnych statystyk fizycznych/magicznych i kolejności przeliczeń; zamiana jednej funkcji obrażeń nie wystarczy.

| Obszar                        | IdleLC                                                             | Potwierdzone zachowanie źródła                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bazowe obrażenia              | `max(1,A²/(A+D))`, losowe ±10%, następnie crit całego wyniku       | Osobny składnik statystyki + mnożnik broni − obrona; physical odejmuje `D/5` albo `D/3,5`, magic pełne `resist`. Crit mnoży broń, nie całe obrażenia. |
| Trafienie                     | 92% + 2 pp/poziom + `(hit−dodge)` pp; clamp 50–98%                 | Porównanie dwóch niezależnych rzutów całkowitych `U(1,1000H)>U(1,1000A)`, po klasowych i poziomowych przeliczeniach H/A.                              |
| Typ trafienia                 | hit/crit, własne prawdopodobieństwo crit                           | weak/normal/strong/hard/critical/deadly; sześć niezależnych rzutów i wybór maksimum. Wagi nie są procentami.                                          |
| Magic/range                   | Jeden `attack`, jeden `defense`                                    | melee/range/magic, osobne weapon attack/magic, defense/resist, hit/avoid dla typu.                                                                    |
| Statystyki bohatera w LC mode | Mediany potworów, cel 8 trafień na zabicie i 30 na śmierć bohatera | Statystyki postaci, broń/pancerz, opcje, passive, assist i poziomy wyposażenia; nie skalowanie do lokalnych potworów.                                 |
| Zwykły NPC                    | `max(0.6,a_attackSpeed/10)` s i 5% crit ×1,5                       | Odstęp AI `floor(a_attackSpeed*15/10)` pulse; pulse ma 0,1 s. Zwykłemu NPC kod zeruje wagi crit/deadly; boss/miniboss je zachowuje.                   |
| Skill damage                  | `1+power/100` razy zwykłe obrażenia                                | `MDT_ONLYPOWER`, `MDT_ADDITION`, `MDT_RATE` mają różne ścieżki i asymetrie implementacji.                                                             |
| Block/żywioły/PvP             | Brak pełnego modelu w tych czterech modułach                       | Block dzieli damage/2, asymetryczna tabela elementów × iloraz poziomów, dalsze PvP /4 i redukcja z plusów pancerza.                                   |

Źródła porównania: IdleLC `src/game/logic/balance.ts:10–17,45–55,61–64,77–95`; `lcBalance.ts:10–12,44–61`; `fighters.ts:56–70`; `combat.ts:621–639,664–672`; `src/game/data/monsters.ts:58–72`. Szczegółowe dowody oryginału poniżej.

## Która implementacja faktycznie działa

`GetHitType()` dla prawidłowych wskaźników natychmiast zwraca `GetHitType_Adult()` (`GameServer/Battle_GetDamage.cpp:37–40`). Starsze formuły DEX/INT znajdujące się dalej w tej funkcji nie obsługują prawidłowych wywołań. `SelectHitType()` najpierw obsługuje `MHT_CONSTANT`, po czym bezwarunkowo zwraca `SelectHitType_Adult()` (`:250–424`). Starsza tabela procentowa, cap crit 20% / Ranger 50% oraz cap deadly 10% leżą za tym powrotem. Nie należy ich przenosić jako czynnych zasad.

`ProcAttack` wywołuje `GetHitType`; tylko wynik różny od `HITTYPE_MISS` przekazuje do `SelectHitType`; potem zawsze wywołuje `GetDamage`, następnie `ApplyHateByDamage` i `ApplyDamage` (`GameServer/Battle.cpp:66–94`). Adult selector nie odczytuje maski `flag`, lecz wcześniejszy warunek w `ProcAttack` zachowuje rzeczywiste pudła. `GetDamage` zwraca 0 dla MISS (`Battle_GetDamage.cpp:598–599`).

Flagi: MISS=1, WEAK=2, NORMAL=4, STRONG=8, HARD=16, CRITICAL=32, DEADLY=64 (`ShareLib/Config.h:980–987`). Typy obrażeń: melee=0, range=1, magic=2 (`ShareLib/MessageType.h:2464–2468`). `SKILL_RATE_UNIT=100`, mimo starego komentarza „10000” (`GameServer/Skill.h:6`).

## Statystyki i wybór rodzaju ataku

`CPC::CalcStatus` odtwarza zapisane HP/MP i STR/DEX/INT/CON, ustawia bazową szybkość ataku 12, następnie stosuje wyposażenie, passive, title/artifact i assist w tej kolejności (`GameServer/PC.cpp:2518–2539,2680–2698`). Zapisane `m_db*` nie są końcowym arkuszem walki. Główne eq/op/passive/assist są ponownie łączone podczas `GetDamage`.

`CPC::GetAttackType(proto)` zwraca magic dla `ST_MAGIC`; pozostałe skille i normalny atak biorą typ z broni: range, magic albo melee; bez broni melee (`PC.cpp:4076–4102`). Łuk i kusza są range; shortstaff/staff/wand/scythe/polearm/soul są magic. Dagger (`SHORTGUM`) jest melee, ale korzysta z DEX. Łuk/kusza/dagger używają DEX, sześć magicznych broni INT, pozostałe STR (`GameServer/Item.cpp:529–586`; `Character.h:1394–1398`). Nie można wybrać wszystkiego wyłącznie na podstawie klasy.

Zwykła broń wnosi oddzielnie `num0` do melee/range, `num1` do magic i `num2` do szybkości; liczby przechodzą przez funkcję ulepszeń i kolejne opcje (`PC.cpp:3103–3127,3129–3175`). `m_eqDefense` i `m_eqResist` również są oddzielne (`PC.cpp:3264–3265`). Więcej szczegółów wyposażenia należy uzgodnić z audytem items.

`CNPC::ResetStat` przenosi STR/DEX/INT/CON, attackSpeed, attackType, attack/magic, defense/resist i elementy z prototypu; `attack` zasila melee albo range według typu (`GameServer/NPC.cpp:130–156`). Prototyp czyta je z DB (`NPCProto.cpp:309–322`), a oddzielne `a_hit`, `a_dodge`, `a_magicavoid` w `:233–235`. To potwierdza, że `a_magic` nie jest dekoracyjną kolumną.

## Trafienie i unik: Adult

Bazowy PC hit/avoid zależy od klasy, rodzaju obrażeń i **automatycznych przyrostów** DEX lub INT. Aktualne całkowite DEX/INT nie jest bezpośrednio użyte w tych dwóch getterach (`GameServer/PC.cpp:6301–6383`):

```text
Hpc = max(0, baseHit[job][type] + (Latt−Ldef) + growthDEXorINT)
Apc = max(0, baseAvoid[job][type] + 10*(Ldef−Latt) + growthDEXorINT)
growth przed profesją = levelup_stat[job][stat] * (L−1)
growth po profesji = levelup_stat2[job*split+job2−1][stat]*(L−JOB_2ND_LEVEL)
                    + levelup_stat[job][stat]*(JOB_2ND_LEVEL−1)
```

Physical używa growth DEX, magic growth INT. Tablice bazowe są w `PC.cpp:270–301`; w kolejności Titan/Knight/Healer/Mage/Rogue/Sorcerer/Nightshadow:

| Klasa       | H melee/range/magic | A melee/range/magic |
| ----------- | ------------------- | ------------------- |
| Titan       | 137/137/137         | 20/20/20            |
| Knight      | 130/130/130         | 28/28/28            |
| Healer      | 142/142/131         | 50/50/38            |
| Mage        | 142/142/142         | 50/50/50            |
| Rogue       | 142/142/142         | 50/50/20            |
| Sorcerer    | 137/137/137         | 44/44/44            |
| Nightshadow | 142/142/142         | 50/50/50            |

`EX_ROGUE`/`EX_MAGE` dodają osobne wiersze pod warunkami kompilacji. NPC ma `H=proto.hit+Latt−Ldef`; A używa dodge dla physical i magicAvoid dla magic, plus `Ldef−Latt` (`GameServer/NPC.cpp:328–357`).

Adult dodaje surowe opcje H/A właściwe dla melee/range/magic, a potem osobno i kolejno passive oraz assist: `value += addition + value*rate/100` (`Battle_GetDamage.cpp:1658–1685`). Są to punkty H/A, nie punkty procentowe trafienia. Dla NPC→PC z drugą profesją od poziomu 31 kod dodaje dodatkowy klasowy unik (`:1691–1823`): dla `c=L−31`, parametru klasy `a`, `t=1+a+c` wybiera `b=300` gdy `t>44`, `200` gdy `t>30`, inaczej `100`; `z=99−a−c` (0 zamieniane na 1); dodaje `(1+a+c)*trunc(b/z)`, zamieniając wynik ≤0 albo >1200 na 1200. Parametry a: Titan 0, Knight 6, Archer 12, Cleric 8, Wizard 10, Witch 8, Assassin 14, Ranger 12, Elementalist 4, Specialist faktycznie 0, Nightshadow 10. Dla Specialist przypisanie `factB=7` zostaje później nadpisane (`:1779,1796–1808`).

PvP `CalcNewHitProb` dodatkowo robi `H += weaponPlus*trunc((Latt+900)/Ldef)` i zmienia unik chaotic defender (`GameServer/Battle.cpp:2679–2698`). Po tych przeliczeniach Adult zapisuje final H/A i losuje (`Battle_GetDamage.cpp:1826–1840`):

```text
N=trunc(1000H); M=trunc(1000A)
trafienie ⇔ randomInt(1,N) > randomInt(1,M)
```

Dla dodatnich poprawnych zakresów i idealnych losowań jednostajnych daje to `P=1−(M+1)/(2N)` dla N≥M, albo `(N−1)/(2M)` dla N<M. To matematyczne rozwinięcie kodu, nie dodatkowa reguła serwera. `GetRandom` przyjmuje int, używa `rand()` i nie naprawia zakresów odwróconych (`ShareLib/Random.cpp:97–112`), a N/M mimo deklaracji LONGLONG są zwężane. Brakuje końcowego clamp H/A po wszystkich korektach; zerowych, ujemnych i przepełnionych zakresów nie należy milcząco zastępować nową formułą.

## Typ trafienia, critical i deadly

Adult startuje z `[50,575,125,100,90,60]` dla weak/normal/strong/hard/critical/deadly (`GameServer/PC.cpp:305–309`; `Battle_GetDamage.cpp:1847–1851`). Dla physical, `dur=trunc(CONdef/3)+stronger_skill+opStrong`, bazowych STR/DEX klasy S0/D0:

```text
weak += trunc((Latt−1)/2)+dur
normal += Latt−1+dur
strong += trunc((STRatt−S0)*5/4)
hard += STRatt−S0
critical += trunc((DEXatt−D0)*9/10)
deadly += trunc((DEXatt−D0)*6/10)
```

Range używa tu STR dla strong/hard tak samo jak melee (`Battle_GetDamage.cpp:1864–1903`). Magic strong używa INT i bazowego INT, lecz magic hard używa **STR minus bazowe INT** (`:1906–1941`). PC dodaje plusStrong/plusHard; opcje critical/deadly zwiększają odpowiednią wagę o `waga*op/100` (`:1948–1953`). Następnie hard/critical/deadly dostają po kolei passive i assist `waga += addition + waga*rate`, **bez /100** (`:1979–1984`). Wierny port musi zachować tę asymetrię albo jawnie nazwać zmianę korektą oryginału.

Zwykłemu NPC kod zeruje wagi crit/deadly; oba flagi `NPC_MBOSS|NPC_BOSS` zachowują obie wagi (`:1986–1994`). Następnie losuje niezależnie `randomInt(1,waga[i])` dla każdego z 6 typów i wybiera największy, a remis wygrywa późniejszy typ (`:1998–2006`). Same bazowe wagi, bez statystyk i modyfikatorów, dają około 0,1263% weak / 85,7559% normal / 7,5764% strong / 3,6932% hard / 2,4576% crit / 0,3908% deadly; nie 5/57,5/12,5/10/9/6%. Obliczenie opisuje mechanizm przy dodatnich wagach, nie rozkład konkretnej postaci.

Drobna, ale rzeczywista pułapka: `GetRandom(1,0)` zwraca 1 według dosłownej implementacji RNG. Zerowanie wag NPC nie jest formalnym wykluczeniem typu przy wszystkich pozostałych rzutach równych 1; w takim remisie wygrywa deadly. W testach zgodności trzeba rozstrzygnąć, czy odtwarzamy tę semantykę.

Dla `magic!=NULL` Adult selector zwraca NORMAL (`:1855–1856`); wcześniej rozpatrywane skille `MHT_CONSTANT` mają osobną gałąź z szansą w skali 10000, rodzajami critical/deadly/hard i odpornościami (`:250–421`). Dla MT_ATTACK idącego przez ProcAttack stały hit jest **drugim sprawdzeniem**: wcześniejsze GetHitType_Adult nadal może zwrócić MISS i pominąć Select (`GameServer/Battle.cpp:79–84`). Inne typy efektów mogą wywoływać Select bezpośrednio — nie wolno uogólniać tego na wszystkie skille. Normalny atak i skill nie współdzielą jednej niezależnej szansy crit jak w IdleLC.

## Obrażenia fizyczne, magiczne i obrona

Poniższe wzory opisują rdzeń po zbudowaniu efektywnego A i obrony; nie pomijają faktu, że późniejsze etapy jeszcze zmieniają utratę HP. `trunc` oznacza obcięcie C++ ku zeru, nie `Math.round`.

```text
physical = trunc(trunc(usingStat*10/statFactor) + trunc(A*k) − (D1+D2)/damFactor)
magic = trunc(INT*10/15) + trunc(A*k) − (R1+R2)
k = 0.8 / 1 / 1.3 / 1.5 / 2 / 2.5  [weak .. deadly]
```

Źródła: melee `GameServer/Battle_GetDamage.cpp:985–1004`, range `:1202–1221`, magic `:1426–1444`. Mnożenia A są w kodzie całkowitoliczbowymi `A*8/10`, `A*13/10` itd., dlatego obcięcia muszą nastąpić na tych etapach. Nie ma losowego ±10% z IdleLC; zmienność pochodzi z losowanego typu trafienia i dalszych procków.

- `damFactor=5`; gdy **defender jest PC**, 3,5, niezależnie od tego czy atakujący jest NPC (`:571–581`).
- `statFactor=15`; dla melee Titan/Knight 20 (`:950–959`), ranged pozostaje 15. Magic przypisuje 20 Healer/Sorcerer, ale końcowy wzór używa literalnego 15, więc to przypisanie nie zmienia wyniku (`:1393–1403,1429–1444`).
- Dla atakującego PC: `A=trunc(A*(1+Hfinal/(Hfinal+Afinal)))`; `minDamage=trunc(usingStat/3)` albo `trunc(INT/3)` (`:976–983,1194–1200,1419–1424`). Iloraz H/(H+A) zwiększa tu **obrażenia**, a nie stanowi końcowej szansy trafienia.
- A zaczyna się od eq+op; passive i assist są stosowane kolejno, z osobnymi dodatkami i rate. Physical ma oddzielne `attack80` z capem 80 osobno na dodatek i część procentową. Dochodzą `npcAttack`/`npcMagic` oraz level bonus (`:822–902,1053–1133,1270–1330`). Te pola nazwane npcAttack/npcMagic są dodawane w tej funkcji bez osobnego warunku „defender NPC”.
- Defense equipment D1 oraz op/addition D2 są modyfikowane osobno; additive defense wchodzi do D2. Magic analogicznie R1/R2 (`:877–902,1306–1330`).
- Bonus ataku po drugiej profesji: `max(L−JOB_2ND_LEVEL,0)`, inaczej 0 (`GameServer/Character.cpp:1071–1083`). Physical defense PC ma +3L, a bazowe resist +trunc(L/2) (`Character.h:514–521`).

Istotna rozbieżność C++: `CCharacter::GetResistLevelBonus() const` zwraca PC L/2. `CPC::GetResistLevelBonus()` **nie ma const** i ukrywa metodę, zamiast ją nadpisywać (`Character.h:518–521,1414–1425`). Wywołanie przez `CCharacter* df` w `GetDamage` (`Battle_GetDamage.cpp:1330`) daje L/2 każdej klasie. Status liczony przez `CPC* ch` (`CmdMsg.cpp:691`) może pokazać pełne L dla Mage/Healer/Sorcerer/Nightshadow. Interfejs klienta nie jest tu dowodem formuły obrażeń.

Kary za za wysoki level wyposażenia są realną częścią wzoru: `adef=GetAttackLevel()−L`, `ddef=GetDefenseLevel()−L` (`Battle_GetDamage.cpp:726–728`). A: różnica 5–8 → /2, 9–12 → *3/10, ≥13 → /10; D1/D2: 6–10 → /2, 11–15 → *3/10, ≥16 → /10 (`:904–926`; analog range/magic). AttackLevel to level broni/composite; DefenseLevel to **maksymalny** level sześciu slotów, mimo komentarza o średniej. Bez żadnego pancerza DefenseLevel=2L (`GameServer/PC.cpp:3995–4073`). `PREMIUM_CHAR` warunkuje getter levelu przedmiotów.

Sorcerer evocation modyfikuje physical defense (Hellound ×10/11; Elenen ×10/7); Elenen magic attack ×10/13 i magic resist ×13/10 (`Battle_GetDamage.cpp:933–947,1360–1390`; range analog). Dochodzą castle/Dratan bonuses i probabilistyczne redukcje obrażeń (`:756–815,962–1017,1405–1458`), charge i efekty wież. Nightshadow z passive 870 w lokalnych godzinach serwera 22:00–04:59 dostaje +10% (`:1587–1602`). To zależność od zegara/strefy serwera, nie czasu symulacji IdleLC.

## Block, elementy i PvP: kolejność ma znaczenie

Po rdzeniu GetDamage, w kolejności:

1. Normalny atak PC/PET/ELEMENTAL/APET przeciw tej samej grupie ma korektę `damage += damage*((Latt−Ldef)/(Latt+Ldef))`; dzielenie jest **int**, więc przy dodatnich poziomach ten człon wynosi 0 (`GameServer/Battle_GetDamage.cpp:1496–1500`).
2. Wyjątki eventów/tower, a skill PC→PC ma kompresję części ponad normalne deadly: `deadly+(damage−deadly)/3` (`:1506–1553`).
3. Minimum, potem block wyłącznie dla defender PC i `magic==NULL`: `randomInt(1,100)<=m_opBlocking` → damage/2; ponownie minimum 1 (`:1556–1572`). To redukcja obrażeń; nie MISS i nie osobny HITTYPE.
4. APet faith oraz nocturnal Nightshadow (`:1574–1602`).
5. Elementy: `trunc(damage*table[att][def]*(attLevel/defLevel))`, z float ilorazem poziomów. Poziom ≤0 zamieniany na 1, maksymalny obsługiwany 5; nieprawidłowy indeks/poziom pomija mnożenie. Potem minimum 1 (`:1605–1632`). Typ jest w dolnym nibble, poziom w górnym (`GameServer/Skill.h:31–44`).
6. Mercenary NPC→PC /23, invincibility, absorpcja PC→PC `damage -= damage*absorbRate/10000` (`Battle_GetDamage.cpp:1634–1641`). Nie wszystkie wcześniejsze minima są powtarzane po tych wyjątkach.

Tabela elementów `GameServer/Battle_GetDamage.cpp:12–22` (wiersz ataku, kolumna obrony):

|       | NONE | FIRE | WATER | EARTH | WIND | DARK | LIGHT |
| ----- | ---: | ---: | ----: | ----: | ---: | ---: | ----: |
| NONE  |    1 |  0,7 |   0,7 |   0,7 |  0,7 |  0,8 |   0,8 |
| FIRE  |  1,3 |    1 |   0,8 |   1,2 |    1 |  1,1 |   0,9 |
| WATER |  1,3 |  1,2 |     1 |     1 |  0,8 |  1,1 |   0,9 |
| EARTH |  1,3 |  0,8 |     1 |     1 |  1,2 |  1,1 |   0,9 |
| WIND  |  1,3 |    1 |   1,2 |   0,8 |    1 |  1,1 |   0,9 |
| DARK  |  1,2 |  1,1 |   1,1 |   1,1 |  1,1 |  0,9 |   0,8 |
| LIGHT |  1,2 |  0,9 |   0,9 |   0,9 |  0,9 |  1,5 |     1 |

Normalne PC/NPC biorą attack element z assist albo op PC/proto NPC; skill bierze `of->m_attratt`; defense bierze assist albo op PC/proto NPC (`Battle_GetDamage.cpp:677–724`). Te ścieżki nie są równoważne.

Wynik `GetDamage` wciąż **nie jest utratą HP**. `ApplyDamage` dzieli przez 4 dla obu stron z grupy PC/PET/ELEMENTAL/APET, ustala MISS/minimum, obsługuje trap skill 1753, despair, damage link, manascreen i warunkową redukcję skilli (`GameServer/Battle.cpp:1363–1465`). Potem `CalcNewDamage` zmienia chaotic PvP i odejmuje `sumArmorPlus*damage/(sumArmorPlus+310)` tylko PC→PC (`:1466`; definicja `:2650–2676`). Dopiero później redukowane jest HP (`:1652`). Dla odbicia/linku istnieją oddzielne wyjątki (`:1626–1638`).

## Umiejętności: granica z audytem skills

`GetDamage` rozpatruje `MDT_ONLYPOWER=0`, `MDT_ADDITION=1`, `MDT_RATE=2` (`GameServer/Skill.h:256–258`). Power przechodzi przez `CalcSkillParam`; PvP ma dodatkowe skalowanie ±5% na różnicę poziomów, minimum power 1 (`Battle_GetDamage.cpp:606–635`).

- ONLYPOWER zwraca power **wcześniej**, omijając block/elementy i pozostałą końcówkę GetDamage. `LC_JPN_SKILL_CRITICAL` warunkuje dodatkowe mnożniki typów w tym miejscu (`:641–663`). Późniejsze ApplyDamage nadal działa.
- ADDITION ustawia składnik addytywny, po czym w każdym rodzaju ataku robi `A=trunc(A*(100+L)/100 + power*(1+rate/100))` (`:665–667,860–864,1091–1095,1290–1294`). Dla zwykłego pojedynczego ADDITION rate=0. Nie jest to `1+power/100` razy całość.
- RATE jedynie ustawia rate (`:668–670`), ale wszystkie czynne odczyty rate są pod `if(nMagicPowerAddition)`. Ponieważ switch wybiera ADDITION albo RATE, pojedynczy RATE nie skaluje A tą drogą; stare proste zwiększenie procentowe jest zakomentowane (`:853–856,1283–1286`). Należy traktować to jako dosłowną asymetrię źródła, dopóki brak przeciwnego dowodu z wykonywanego builda.

Skille constant-hit i wieloefektowe wymagają pełnego kontraktu skill/magic/level/probability; audyt skills opisuje resztę. Samo `a_power` nie wystarcza do wiernej interpretacji.

## Timing i łańcuch wykonania

`m_attackSpeed` jest `char` oznaczającym czas w jednostkach 0,1 s (`GameServer/Character.h:293`); serwer `__GAME_SERVER__` ma 10 Hz (`ShareLib/Config.h:103–113`). Domyślnie PC ma 12 (`PC.cpp:2532`), broń ustawia `num2` (`PC.cpp:3127`), bez broni finalnie przywracane jest 12 (`:2773–2777`). Assist najpierw odejmuje `(char)add.attackspeed`, potem `(char)((int)speed*rate.attackspeed/100)` od już zmienionego czasu (`Character.cpp:385–388`). To nie `interval/(1+bonus/100)` z IdleLC `skills.ts:405–409`; przykładowo speed=10 i rate=20 daje 8 pulse, czyli 0,8 s, wobec 0,833… s. Nie znaleziono ogólnego minimalnego attackSpeed odpowiadającego IdleLC 0,3 s (`skills.ts:428`).

PC: `do_Attack` sprawdza własność postaci, dystans `attackRange*2`, kontrolę szybkości, stany i mapę, potem woła `ProcAttack(...GetAttackType(NULL),NULL,0)` (`GameServer/doFuncAttack.cpp:160–194,287–319,361`). Ta ścieżka nie ma timera odrzucającego każdy zbyt wczesny hit: `CheckHackAttack` sumuje oczekiwany czas `+=attackSpeed` i zaobserwowany `+=currentPulse−lastPulse+2`; co pięć **kontrolowanych** ataków porównuje sumy, może zwiększyć hackCount i zeruje liczniki (`Character.cpp:1458–1497`; stałe w `ShareLib/Config.h:134–135`). Działanie zależy też od `IncreaseHackCount` i trybu ataków.

Healer i Nightshadow mają podczas logowania ustawione `ATTACK_TYPE_DOUBLE`; pozostałe klasy NORMAL, warunkowo także EX_MAGE/EX_ROGUE (`GameServer/Server.cpp:4992–5011`). `ChekAttackType` w DOUBLE uruchamia kontrolę szybkości co drugie uderzenie (`Character.cpp:1512–1533`). Nie należy z tego wyprowadzać automatycznego „×2 DPS” bez rytmu wysyłania ataków przez klienta. INFINITY omija kontrolę, lecz nie znaleziono przypisania tego trybu w GameServer; nie jest potwierdzoną aktywną ścieżką (`ShareLib/Config.h:349–351`). Elemental ma tu osobny wyjątek: `CheckHackAttack` natychmiast zwraca false, choć może być do niego skierowany (`Character.cpp:1462–1469`; `doFuncAttack.cpp:264–273`).

NPC: zwykły atak wymaga NPC_ATTACK, CanAttack, zasięgu i sytuacji, w której `MobReadySkill` nie przejęło akcji. Warunek czasu to `currentPulse−attackPulse >= speed*15/10` w arytmetyce int; potem aktualizowany jest pulse i wykonywany ProcAttack (`GameServer/MobActivity.cpp:468–498`). Przy dodatnim speed=12 próg wynosi 18 pulse=1,8 s, nie 1,2 s. Taki sam mnożnik jest w ścieżkach taming/confused/mercenary (`:2322–2325,2376–2379,2515–2518`).

Jest to **próg**, nie gwarantowany dokładny interwał efektywny NPC: `MobActivity` pomija NPC przed `m_delay`, domyślnie przywraca `NPC_ACTIVITY_DELAY=10` (1 s); ruch i skille zmieniają też delay na 0 (`MobActivity.cpp:184–185,248–250,1794,1890,1935`; `ShareLib/Config.h:954`). Stojący NPC może rozpoznać osiągnięty próg dopiero przy kolejnym wywołaniu AI. `LC_GAMIGO` dodaje mapowe warunki ataku (`MobActivity.cpp:464–471`), a `MONSTER_AI` zmienia zarządzanie ruchem, nie pokazane `15/10` (`:478–481,503+`).

Skill `MT_ATTACK` dochodzi do wspólnego `ProcAttack(ch,tch,ch->GetAttackType(proto),skill,i)` (`GameServer/Skill.cpp:3077–3084`). `Ready` zapisuje pulse użycia (`:768–803`); NPC przechodzi READY→FIRE po ready+still, a kończy FIRE po ready+still+fire (`MobActivity.cpp:1119,1475–1483`). PC sprawdza przedwczesny FIRE względem `ready*(100−m_skillSpeed)/100`, lecz ten blok zwiększa hackCount i wysyła komunikat, bez bezpośredniego return/goto (`doFuncSkill.cpp:1561–1571`).

`CSkill::IsReady` bazuje na pulse i reuse; dodaje magicSpeed, PC redukuje reuse przez `150/(150+prob)*100/(100+prob)` dla `prob=opDecreaseSkillDelay+skillCooltime`. Gates `BUGFIX_GUILD_SKILL_COOLTIME` i `SKILL_TYPE_NO_COOL_TIME` wyłączają modyfikatory dla odpowiednich flag; Elemental/APet mają oddzielne gałęzie, a reuse<1 zamienia się na 10 (`GameServer/Skill.cpp:665–723,756–759`). To różni się od liniowej redukcji max50% IdleLC. Dokładną semantykę czasów skillowych opisuje osobny audyt skills.

IdleLC wprowadza własne `.4s` impactDelay, `.5` monsterInitiative i skillAnimationLock=0 (`src/game/logic/combat.ts:27–44`); engage ustawia pierwszy swing NPC po połowie interwału (`:481–490`); wspólny cooldown/impact i cast+.4 dla obu stron są w `:564–603`. Tego nie uzasadnia sama serwerowa ścieżka. Nie analizowano w tym podzadaniu klientowego momentu wysyłania normalnego ataku i markerów animacji: nie ma podstaw, by twierdzić, że klient nie ma opóźnień, ani że wynoszą zawsze 0,4 s. Do wiernej synchronizacji wizualnej potrzebny jest osobny odczyt tego rytmu.

Pełny główny łańcuch: `ProcAttack` → `IsAvailableAttack` → prototypy skill/magic → GetHitType → SelectHitType → GetDamage → ApplyHateByDamage → ApplyDamage → procki opcji → ProcAfterHit dla non-MISS → ProcDead albo refleksja przez kolejne ProcAttack (`GameServer/Battle.cpp:18–37,66–94,95–176,186–203`). `DURABILITY` warunkuje zużycie wyposażenia (`:116–119,146–149`). REFLEX/LINK przyjmują przekazane damage i omijają hit/GetDamage (`:68–85`).

## Warunki kompilacji, granice pewności i migracja

Potwierdzone są powyższe osiągalne ścieżki w dostarczonym tekście źródłowym. Nie ustalono zestawu definicji ani faktycznie uruchamianego binarnego builda. Nie należy przyjmować, że każda gałąź `#ifdef` jest aktywna tylko dlatego, że znajduje się w archiwum. Wpływające warunki: `EX_ROGUE`, `EX_MAGE`, `ENABLE_ROGUE_SKILL125_BRZ`, `LC_JPN_SKILL_CRITICAL`, `DOUBLE_ATTACK`, `EXTREME_CUBE`; z otoczenia `DEV_SYSTEM_MONSTER_MERCENARY`, `ASSIST_REDUCE_SKILL`, `PREMIUM_CHAR`, `DYNAMIC_DUNGEON_BUG_FIX`, `DURABILITY` i regionalne `LC_*`. Przykładowo DOUBLE_ATTACK dodatkowo wymaga runtime eventu (`Battle_GetDamage.cpp:867–875`), a EXTREME_CUBE warunkuje klasową połowę damage PC→NPC (`:1506–1517`).

Obecny model IdleLC traci wymagane informacje: `CombatStats` ma tylko attack/defense i pp hit/dodge (`src/game/data/types.ts:2–29`); `LcMonster` przechowuje magic/resist/hit/dodge, ale `fromLc` ich nie przenosi do fightera (`lcTypes.ts:11–25`; `monsters.ts:65–72`). Import nie zachowuje attackType, magicAvoid, STR/DEX/INT/CON, attack/defense equipment level, elementów i flag boss/miniboss (`scripts/lc/import-db.mjs:125–144`). To braki przepływu danych, nie dowód braku kolumn w zewnętrznym SQL. Nie wolno zamienić flagi elite w boss/miniboss bez oryginalnego znaczenia bitów.

Bezpieczna kolejność przyszłej pracy:

1. Ustalić cel zgodności: konkretny zestaw definicji i zachowanie źródła czy jawne poprawki jego usterek. Ustalić klasy/profesje wspierane w IdleLC.
2. Zachować surowe dane NPC/item/skill/magic/options potrzebne formułom; uzupełnić model fightera o osobne fizyczne/magiczne kanały, statystyki, profesję i elementy. Usunąć skalowanie do median potworów dopiero razem z prawdziwym arkuszem postaci/wyposażenia.
3. Przenieść czyste etapy w oryginalnej kolejności: stat construction → hit/avoid → typ → GetDamage → ApplyDamage. Zachować obcięcia C++ i jednostki; nie przenosić wartości UI jako podstawy walki.
4. Sprawdzić ręcznie z wybranymi rekordami i deterministycznymi rzutami m.in. ranged DEX vs STR typów, magic resist dispatch, overlevel gear progi, zero H/A, weak/crit/deadly, block/element ordering, ADDITION/RATE/ONLYPOWER, NPC boss flags, PvP /4 i armor plus. Wyniki powinny zawierać składniki pośrednie, żeby różnicę dało się wskazać.

Do twierdzenia o wiernym zachowaniu brakuje potwierdzonego build profile, zgodności zewnętrznych danych z tym buildem, pełnego docelowego modelu postaci/profesji/ekwipunku i walidacji na reprezentatywnych przypadkach. Audyt statyczny daje wiarygodną podstawę implementacji; nie dowodzi tożsamości z dowolnym działającym serwerem LC.

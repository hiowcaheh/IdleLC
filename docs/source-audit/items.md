# Przedmioty, opcje, rare i ulepszanie — audyt źródeł

> Raport źródłowy z analizy 2026-11-02, porównujący stan IdleLC `c9944c9` przed wdrożeniem. Opisy „obecnie”, „bez zmian” i numery linii IdleLC dotyczą tego punktu odniesienia. Aktualny stan wdrożenia: [przekazanie prac](../development-handoff.md). Pochodzenie i prefiksy źródeł: [indeks audytu](README.md).

Stan: 2026-11-02. Audyt tylko odczytu; początkowy `git status --short` w katalogu IdleLC był pusty. Nie wykonano oryginalnych programów ani zmian w repozytorium. Poniższe ustalenia pochodzą z kodu **November 2018**, nie dowodzą zachowania serwera Nemesis z 2015 r. ani aktywnego zestawu flag kompilacji. Raport zapisano poza repozytorium.

Prefiksy ścieżek (numery oznaczają fizyczne linie odczytanych plików):

- `S` = `główny katalog archiwum serwera 2018`
- `C` = `główny katalog archiwum klienta 2018`
- `I` = `główny katalog repozytorium IdleLC`

## Najważniejsze rozbieżności i decyzje

| Mechanika               | Zweryfikowany oryginał 2018                                                                                                     | IdleLC obecnie                                                                         | Klasyfikacja                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Efekty ekwipunku        | Osobno melee/range/magic i physical/magic defense, bazowe statystyki postaci, opcje, pasywki, assist; brak gear-reference ratio | Suma attack+magic/defense+resist, ratio do gearReference, naked attack 0.6/defense 0.5 | Własny model wymagający decyzji migracyjnej                           |
| Wzrost plusa            | Potęga 1.06/1.07 dla level<146; osobny wzór 1.188 dla level>=146, progi dodatkowych bonusów                                     | Liniowo +10% za plus                                                                   | Własny balans, nie dane 1:1                                           |
| Heaven Stone 85         | SPECIAL: m.in. 7% destroy i 13% -1 od +3, sukces 60−3p% przed +18, reszta unchanged                                             | Własna tabela 100…35%, unchanged do +9, -1 od +10, brak destroy                        | **Zachować bezpieczeństwo +10 i brak destroy do decyzji właściciela** |
| Smelting Stone 84       | GENERAL sam ulepsza; także wytwarzany z ekwipunku, level stone zapisany w instance flag                                         | Wymiana 10 sztuk -> Heaven; sam nie ulepsza                                            | Komentarz jawnie „owner's value”; zachować do decyzji                 |
| Losowanie zwykłej opcji | `a_prob` to współczynniki skalowane poziomem i liczbą opcji; wynik zwykłego generatora wyłącznie level1–3                       | Wprost wagi wszystkich poziomów z DB                                                   | Rozbieżność algorytmu                                                 |
| Dodawanie opcji         | Blood Points z walki -> oznaczenie jednego slotu -> użycie Blood Gem; max armor3/weapon5                                        | Co 600 sekund gra sama dodaje opcję, również akcesoriom, max5                          | Jawna reguła właściciela; zachować do decyzji                         |
| Identyfikacja rare      | Wybór zestawu na stałej skali 1..10000, potem niezależne bity opcji                                                             | Wybór zestawu normalizuje sumę wag                                                     | Istotne, gdy suma wag !=10000                                         |
| Lupa1838                | 30% przy `HOLY_WATER`, 50% inaczej;1839/2666 100%                                                                               | 1838 60%,1839 100%; bez2666                                                            | Własna szansa i ograniczony katalog                                   |
| Special rare od77       | Zestawy tylko z `t_item.a_rare_index_i`                                                                                         | Importer dopisuje zestawy 53/56/57/60/59 od77 według slotu                             | Jawna reguła właściciela; **nie usuwać automatycznie**                |
| Opcje24/25              | Enum `NOT_USED`, brak przypadków w CPC::ApplyOptionValue                                                                        | MP/HP steal                                                                            | Potencjalna niezgodność wersji danych/semantyki                       |
| Opcja55/66              | Zwiększa wagę critical/deadly procentowo, nie bezpośrednią szansę ani damage multiplier                                         | 55 dodaje critChance;66 critMultiplier                                                 | Inna semantyka                                                        |
| Opcja63                 | Szansa w % na połowę obrażeń zwykłego ataku                                                                                     | Dodaje punkty procentowe dodge                                                         | Inna semantyka                                                        |
| Level wymagań           | Zwykły gear można nosić ponad poziom; kary liczy combat. Rare/origin/artifact wymagają poziomu                                  | Każdy gear ma twardy limit level                                                       | Inna reguła                                                           |

Źródła IdleLC: `I/src/game/logic/equipment.ts:28–46,77–122,137–168,254–305`; `I/src/game/logic/options.ts:25–37,65–104,127–173,199–241`; `I/src/game/logic/rare.ts:35–59,87–149`; `I/src/game/data/items.ts:78–125`; `I/scripts/lc/import-db.mjs:225–240,312–332`.

## Pochodzenie danych i granice importera

`COptionProtoList::Load`, `S/GameServer/Option.cpp:43–95`: `SELECT * FROM t_option ORDER BY a_index`; `a_type` jest kluczem efektu, `a_level` i `a_prob` parsowane parami do wektorów; maski `a_weapon_type/a_wear_type/a_accessory_type` z DB. Efekty **nie są** w DB: implementuje je switch w `COption::ApplyOptionValue(CPC*,...)`, `Option.cpp:326–756`. Gdy podano `nPosition`, wartość najpierw mnoży `origin variation /100` (:355–358).

`CItemList::Load`, `S/GameServer/Item.cpp:325–422`: z DB wczytuje m.in. 64-bitowy flag, job mask, num0..4, level/level2, wearing, max_use, fame, set0..4, rare index/prob, origin variation, RvR i pod `DURABILITY` durability. `a_grade` na :386 ma komentarz „pet weapon type”; **nie jest** grade A–E zestawu rare. `a_need_item*` i `a_need_sskill*` (:388–398) to materiały/skill produkcji, nie udowodnione wymagania STR/DEX do noszenia.

`I/scripts/lc/import-db.mjs:173–178,242–266` eksportuje wybrany podzbiór items oraz typ/subtyp/slot/level/jobFlag/flag/price/num0..4 i rare. Nie eksportuje tu np. level2, fame, durability, origin/set variation, limitów użycia, wymogów RvR. `I/src/game/data/items.ts:97–125` sprowadza num0/1 broni do attack/magicAttack, zbroi do defense/magicDefense, num2/10 do attackInterval. To prawdziwe kolumny źródłowe, ale uproszczona interpretacja statystyk.

`CRareOptionProtoList::Load`, `S/GameServer/RareOptionProto.cpp:77–163`: odrzuca `a_grade=-1`, wczytuje flat attack/defense/magic/resist, grade oraz do10 option type/level/prob. Wartość opcji pobiera z `t_option.a_level[level−1]` (:138–148); musi więc istnieć właściwa tabela t_option. Importer `I/scripts/lc/import-db.mjs:436–460` filtruje wyłącznie po używanych id, nie jawnie grade!=-1: walidacja tego przypadku jest brakującym warunkiem zgodności.

## Opcje: identyfikatory i jednostki

Autorytatywny enum tej gałęzi: `S/ShareLib/Config.h:1277–1400`. Efekty PC: `S/GameServer/Option.cpp:359–756`.

| Identyfikatory | Działanie oryginalnego CPC                         | Jednostka / szczegół                                                                                                            |
| -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 0,1,2,3        | STR,DEX,INT,CON i ich oddzielne op-stat counters   | Punkty statystyki, **bez filtracji klas**. STR zwiększa też HP, INT MP, CON HP+MP według `levelup_hp/mp[job]`                   |
| 4,5            | maxHP,maxMP                                        | Punkty                                                                                                                          |
| 6              | melee+range attack                                 | Punkty obu kanałów                                                                                                              |
| 7,8            | melee / range attack                               | Punkty konkretnego kanału                                                                                                       |
| 9,10           | melee / range hit                                  | Surowe punkty rating, nie 0.1pp szansy                                                                                          |
| 11             | melee+range defense                                | Punkty obu fizycznych kanałów                                                                                                   |
| 12,13          | melee / range defense                              | Punkty konkretnego kanału                                                                                                       |
| 14,15          | melee / range avoid                                | Surowe punkty rating                                                                                                            |
| 16–19          | magic attack, magic hit, magic resist, magic avoid | Osobne kanały; hit/avoid to rating                                                                                              |
| 20–23          | all attack/hit/defense/avoid                       | Dodaje do trzech odpowiednich kanałów                                                                                           |
| 24,25          | `OPTION_NOT_USED_24/25`                            | Brak obsługi w odczytanym switchu PC; **nie utożsamiać z51/52**                                                                 |
| 26–31          | Enum fire/water/wind/earth/dark/light              | Brak przypadków w tym switchu CPC;32–35 to luka enumu,36–48 opcje mix. Nie wyprowadzać mechaniki z samego angielskiego opisu DB |
| 49             | Reduced Level Requirement                          | Obsługiwane w `CItem::GetItemLevel`, nie jako zwykła zmiana statystyki                                                          |
| 50             | Flat HP recovery                                   | `m_opRecoverHP_NoRate`; enum komentuje zmianę z inventory capacity po2013                                                       |
| 51,52          | MP/HP steal                                        | Wartość % obrażeń, ale **proc5%**, ze szczególnymi warunkami ścieżki walki                                                      |
| 53,54          | Blind/poison attack                                | Zachowuje maksimum z noszonych wartości zamiast sumowania                                                                       |
| 55             | Critical                                           | `weight += weight*value/100`, nie value/1000 szansy                                                                             |
| 56,57          | HP/MP recover                                      | Procent zwiększenia obliczonej regeneracji, nie płaski regen                                                                    |
| 58             | Skill cooldown                                     | `reuse *=150/(150+v)*100/(100+v)` po dodaniu skillCooltime, z gate'ami guild/no-cooltime                                        |
| 59             | Skill MP cost                                      | `needMP -=needMP*v/100`                                                                                                         |
| 60,61,62       | Resist stone/stun/silence                          | Sumowane, każdy cap80                                                                                                           |
| 63             | Blocking                                           | Przy zwykłym ataku `random1..100<=value` -> damage/2; to nie avoidance                                                          |
| 64             | Run speed                                          | Kolejno `speed += speed*v/100`, może się składać multiplikatywnie według kolejności                                             |
| 65             | Fly speed                                          | `value/10.0` dodane do flySpeed                                                                                                 |
| 66             | Deadly                                             | `deadlyWeight +=deadlyWeight*v/100`, nie bonus critical damage                                                                  |
| 67–72          | STR/DEX/INT/CON/HP/MP rates                        | % odpowiedniej bazowej `m_db*`, integer truncation                                                                              |
| 73,74          | Weapon/armor rate                                  | % bazowego num0/1 noszonych przedmiotów, osobno kanały; composite uwzględniony                                                  |
| 75–78          | Hit/avoid rate                                     | % bieżącego ratingu;75/77 wpływają także range                                                                                  |
| 79,80          | Recover rate                                       | % bieżącego `m_recoverHP/MP`                                                                                                    |
| 82,83          | EXP/SP rate                                        | Oddzielne m_opExpRate/m_opSPRate; nie przenosić na attack                                                                       |
| 84–86          | APet transform/element hp/attack                   | System pet; zakres85/86 ma obsługę PC,84 w APet overload                                                                        |
| 87–98          | Attack/defense elemental type+level                | Zapis `AT_MIX(type,nValue)`, nie dodatkowe płaskie obrażenia                                                                    |
| 99             | Wszystkie cztery statystyki                        | Włącznie z konsekwencjami HP/MP                                                                                                 |
| 100,101        | PvP absorb/debuff time reduction                   | Osobne pola procentowe                                                                                                          |
| 102,103        | Flat HP/MP recovery                                | Dodatki po procentowych modifierach regeneracji                                                                                 |
| 104,105,106    | Strong/hard/HP                                     | Oddzielne pola;106 daje maxHP mimo nazwy enumu INCREASE_HP/recovery komentarza                                                  |
| 107–110        | Client-only metadata                               | Enum zaznacza hardcoded effect; brak przypadku w tym switchu PC                                                                 |

Efekt statystyk0..3: `Option.cpp:361–383`; bazowe tabele sześciu klas `S/GameServer/PC.cpp:75–99`: STR->HP `[4,4,4,3,5,5]`, INT->MP `[8,6,9,10,7,7]`, CON->HP `[8,11,7,8,12,5]`, CON->MP `[2,2,2,1,2,4]` w kolejności titan/knight/healer/mage/rogue/sorcerer. `I/src/game/logic/options.ts:39–45,66–69` zamiast tego filtruje klasy STR/DEX/INT i daje CON=5HP; nie jest to równoważne.

Jednostki rating/critical zweryfikowane także przez audyt combat: `S/GameServer/Battle_GetDamage.cpp:1664–1685` dodaje opcje do ratingów, :1831–1840 porównuje dwa losowania o zakresach zależnych od ratingu; :1952–1953 mnoży wagi critical/deadly. `I/src/game/logic/skills.ts:394–403` traktuje hit/dodge jako value/10pp,55 jako value/1000 probability i66 jako value/100 critical multiplier — wszystkie te modele różnią się od2018.

Dokładne konsumpcje special: regen `S/GameServer/PC.cpp:2440–2447`; steal `S/GameServer/Battle.cpp:1509–1564` (5% proc, realdamage*value/100, cap zasobów); cooldown `S/GameServer/Skill.cpp:686–705`; MP `S/GameServer/doFuncSkill.cpp:989–990,1671–1672`; blocking `S/GameServer/Battle_GetDamage.cpp:1559–1568`.

## Zwykłe opcje: generation i zdobywanie

`COption::MakeOptionValue`, `S/GameServer/Option.cpp:117–169`:

1. `factor=[a_prob[4],a_prob[3],a_prob[2],a_prob[1]]`.
2. `num=1` jeśli przekazano0; `p[i]=floor(factLevel*factor[i]/num)`, cap `[100,500,2000,4000]`.
3. Dla `i>1` kod dodaje poprzednie `p[i−1]`. To dosłowny warunek **i>1**, nie i>0; nie „naprawiać” bez decyzji.
4. Roll1..10000: `<=p[2]` level3, `<=p[3]` level2, reszta level1. Gałęzie level4/5 są zakomentowane. Wartość bierze `a_level[level−1]`.

`I/src/game/logic/options.ts:163–173` losuje liczbę1..5 z `[40,30,18,9,3]`, typy równomiernie bez powtórzeń z filtrowanej puli, a level wprost z a_prob. Wspólne są maski subtypów, różne są count, typ-choice i level distribution.

Akcesoria po dropie: `CArea::DropItem`, `S/GameServer/Area.cpp:1310–1444`: rare/origin pomija; wyjątki item1301..1306 nie dostają tych opcji. Count zależy od **poziomu zabitego NPC `ch`**: factors `[10,40,80,100]`, limits `[500,2000,4000,5000]`. Faktyczny warunek :1374 porównuje każdy wynik do **limit[0]**, a gdy jest większy ustawia **limit[i]**. Roll wybiera 5/4/3/1, reszta2. Typ0..23 z losowym początkiem i cyklicznym skanowaniem kolejnych nieużytych typów, następnie maska accessory. `MakeOptionValue(proto,ch->m_level,num)` ustala poziomy (:1443). To nie jest równomierne próbkowanie dozwolonej puli IdleLC.

Blood: `S/GameServer/Battle_ProcAfterHit.cpp:170–195` po trafionych kontaktach PC<->NPC, jeśli playerLevel−mobLevel<5, odejmuje odpowiednio15 attack /3 defense z5000 (`S/ShareLib/Config.h:1443–1445`). Po wyczerpaniu resetuje5000 i wywołuje `CPC::SettingItemOption`. Funkcja `S/GameServer/PC.cpp:3780–3847` wybiera jeden noszony slot helmet..boots, pomija max weapon5/armor3, narzędzia, lord, CanBloodGem==false i już oznaczone, a potem ustawia `FLAG_ITEM_OPTION_ENABLE`; nie nadaje opcji automatycznie.

`do_ItemOptionAddReq`, `S/GameServer/doFuncItem.cpp:3875–4058`: tylko weapon/armor; zwykły Blood Gem wymaga enable flag, właściwego type/subtype/num0. Item2361 ma osobną ścieżkę wyjątków (bez rare/composite/origin i listy specjalnych itemów). Typ0..23, brak powtórzeń, cykliczny skan + maski, `MakeOptionValue(proto,item.GetItemLevel(),oldOptionCount)`, następnie clear enable flag. Capy `S/ShareLib/Config.h:1410–1413` to accessory5,weapon5,armor3; Idle daje5 każdemu slotowi, a `growable()` obejmuje akcesoria.

## Stosowanie ekwipunku i plus scaling

`CPC::CalcStatus`, `S/GameServer/PC.cpp:2518–2698`: reset do DB stats/recovery/rating counters -> `ApplyItemValue` (:2681) -> `ApplyPassive` (:2684) -> title -> artifact -> zapis baz przed assist -> `m_assist.Apply` (:2698). To istotna kolejność dla procentowych efektów. `I/src/game/logic/equipment.ts:96–122` najpierw liczy ratio mocy i dopiero zbiorczo nakłada opcje; nie odtwarza tych kanałów ani kolejności.

`CPC::ApplyItemValue`, `S/GameServer/PC.cpp:2858` bierze `getCalcWear`, rozwiązuje composite, ma osobne hardcoded lord/pet-unique gear. Dla standardowej broni :3103–3163:

- Wybiera range przez `IsRangeWeapon`, pozostałe melee; magic oddzielnie.
- Do bazowego num0/1 broni **przed scalingiem** dodaje plus2 i rare attack/magic, następnie wywołuje `ItemUpgradeFuckingFunction` (:3112,:3120,:3126).
- Potem stosuje wybrane rare option bits oraz wszystkie cztery płaskie bonusy rare przez opcje6/11/16/18 (:3129–3145), albo origin, albo zwykłe opcje.
- Na końcu `ApplyItemPlusValue` (:3163). Płaskie rare bonusy broni są więc widoczne także osobno w op-counterach; nie sprowadzać tego automatycznie do pojedynczego `(base+rare)*factor`.

Armor standardowe :3262–3304: skaluje samo num0 i num1, potem stosuje rare options + flat rare bonuses do op-counterów, potem progi plus. W odróżnieniu od broni rare defense/resist nie wchodzi tu do samej potęgi. `I/src/game/logic/equipment.ts:77–86` sumuje attack+magic lub defense+resist wraz z rare bonusem i skaluje całość liniowo.

Funkcja skalująca `CPC::ItemUpgradeFuckingFunction`, `S/GameServer/PC.cpp:7048–7098`:

```text
p=0: return B
L<146: f=1.06 dla p<=10; f=1.07 dla p>10
       p<=17: trunc(B*f^p)
       p>17: trunc(B*f^17 + (p-17)*B*(f^17-f^16))
L>=146: f=1.188
        p<=17: trunc(B+B*f^p/10)
        p>17: trunc(B+B*f^17/10+(p-17)*B*(f^17-f^16)/10)
```

Argument L jest efektywnym `GetItemLevel()`, co łączy opcję49 z gałęzią scalingu. Wspólny próg146: `S/ShareLib/Config.h:885`. Własne `PLUS_BONUS=0.1` Idle nie jest przybliżeniem tego samego algorytmu.

`ApplyItemPlusValue`, `S/GameServer/PC.cpp:3509–3637`, L<146: weapon +6 daje6 physical albo4magic zależnie od subtypu; +8 daje3 do hit-ratings albo +2 attack range; +10 strong+300;+12 hard+400;+15 dodatkowo75physical/50magic. Armor poza shield: +8 defense10,+10resist10,+12weak500; każdy armor+15 defense100,resist50. Gałąź L>=146 (:3640–3720) ma inne progi, np.weapon +6..15 dodaje45*(p−5),16..19=450,20..24=550,25..30=700. Te dodatki nie istnieją w Idle modelu.

## Rare, identyfikacja, grade

Rare rozpoznaje proto `ITEM_FLAG_RARE` bit15 (`S/GameServer/Item.h:308–310`, `S/ShareLib/Config.h:638`), natomiast `I/src/game/logic/rare.ts:20–21` rozpoznaje je po niepustej tablicy zestawów. To osobne kryteria wymagające walidacji dumpa.

`CItem::IdentifyRareOption`, `S/GameServer/Item.cpp:80–125`: gdy m_nOption!=0 i reform==false, return. Jeden roll1..10000; przegląda do10 wpisów item rare w kolejności, wybiera gdy roll<=prob[i], inaczej odejmuje prob[i]. **Nie dzieli przez sumę wag**. Gdy suma<10000 może nie wybrać nic; gdy suma>10000 późniejsze zestawy są efektywnie obcięte. Dla poprawnego proto każdą opcję próbuje niezależnie z `min(10000,optionprob+10*count_)`; zapisuje id zestawu i bitmaskę (m_nOption=2) nawet gdy bitmask=0.

`I/src/game/logic/rare.ts:46–59` usuwa nieznane zestawy i normalizuje dodatnie wagi; opcje rolluje niezależnie `chance/10000`. Ta druga część zgadza się dla zwykłej identyfikacji count_=0, pierwsza tylko przy szczególnych założeniach danych. Brak reform systemu: oryginał `S/GameServer/doFuncReformSystem.cpp:149–161` zużywa count_ golden magnifiers i wywołuje IdentifyRareOption(true,count_).

`do_ItemUse_1838_1839`, `S/GameServer/doFuncItem.cpp:7066–7129`:1838 =30% `#ifdef HOLY_WATER`, inaczej50%;1839 i2666=100%. Tylko przedmiot znaleziony w inventory, rare, nieidentyfikowany i nie-origin (:7089–7098). Po udanym rzucie handler wysyła OK i CalcStatus, bez sprawdzenia czy sam wybór zestawu faktycznie się powiódł. Idle60% jest własnym parametrem (`I/src/game/data/items.ts:84–88`); Idle dopuszcza również worn rare (`I/src/game/logic/rare.ts:136–149`), czego ta oryginalna ścieżka nie robi. Nie znaleziono odrębnego autorytatywnego handlera „appraiser” po nazwie; zbadana ścieżka identyfikacji to użycie lupy. Nie wywodzić szans z opisów NPC. Handler zwraca true także po failed roll (:7122–7129); zwykła ścieżka `do_ItemUse` po zaakceptowanym użyciu zużywa1 item (:1317–1318), więc failed magnifier attempt kosztuje lupę i pozostawia rare niezidentyfikowany.

Grade0..4 =Hero A/Unique B/Rare C/Magic D/Basic E potwierdza klient `C/Engine/Help/Util_Help.cpp:16–24`; to ta sama skala co `I/src/game/logic/rare.ts:17–18`. Grade jest polem zestawu rare w `RareOptionProto.cpp:105,157`, nie mnożnikiem mocy. Nie znaleziono mnożenia bonusów przez grade w zbadanych handlerach. Nazwa/prefix i kolory klienta są prezentacją; `t_item.a_grade` ma inne zastosowanie.

## Noszenie, ręce, bind i durability

`CItem::CanWear`, `S/GameServer/Item.h:991–1008`: musi mieć wearing!=-1, nie być już noszony, nie być schowanym underlying composite ani sealed. `CanUpgrade` :973–979 wymaga item proto UPGRADE flag i !lent. `I/src/game/logic/equipment.ts:153–159` zna tylko typ gear/class/level/dual-shield; nie przechowuje runtime sealed/lent/composition flag.

`CWearInvenManager::CanDressNormal`, `S/GameServer/WearInvenManager.cpp:599–683`: RvR faction/grade, castellan role/zone, job mask i fame. Accessory slot wybiera wolny1..3 albo1 (:709–726). Twardy level sprawdza dla rare/origin i artifact (:804–861); premium gate obniża wymaganie o3, z minimum1 (`Item.cpp:128–144`). Zwykły ponadpoziomowy gear dostaje kary w walce, np.physical attack przy różnicy5..8=50%,9..12=30%,13+=10%; defense przy6..10=50%,11..15=30%,16+=10% (`S/GameServer/Battle_GetDamage.cpp:904–926`; range/magic analogi :1135–1157,:1332–1353; poziomy gear `S/GameServer/PC.cpp:3995–4073`). Idle zamiast tego blokuje noszenie każdego itemu za wcześnie.

Opcja49: `CItem::GetItemLevel`, `S/GameServer/Item.cpp:147–235`: wybiera **największą redukcję** z rare/origin/zwykłych opcji (minimum effective level), nie sumę wszystkich; osobno odejmuje socket jewel slot0, cap minimum1. Idle `I/src/game/logic/options.ts:145–148` sumuje wszystkie49, `I/src/game/logic/equipment.ts:137–138` cap0, bez socket/premium.

Ręce: blok w `CWearInvenManager::AddNormalItem`, `S/GameServer/WearInvenManager.cpp:179–277`, obejmuje crossbow/staff/bigsword/axe/bow/narzędzia/twosword/scythe/polearm/soul. Zakładanie takiej broni zdejmuje shield; zakładanie shield **zdejmuje broń** (z wyjątkiem sealed:reject). Idle `I/src/game/logic/equipment.ts:157–168` obsługuje tylko dual swords, a zakładanie shield z dual zwraca hands-full. Reprezentacja dual jako jeden weapon slot jest zgodna z tym zakresem kodu; nie ma tutaj dwóch niezależnych offhand weapon slotów.

Bind: `S/GameServer/Item.h:1019–1032` odróżnia instance BELONG flag od proto belong type. Przy zakładaniu origin item i GetBelongType()!=NONE -> ustawia BELONG (`WearInvenManager.cpp:279–290`), także underlying composite. To nie dowodzi globalnego bind-on-equip dla wszystkich rare. Idle GearPiece przechowuje tylko uid/itemId/plus/options/rare (`I/src/game/logic/equipment.ts:49–56`), bez bind state.

Durability wymaga `#ifdef DURABILITY` i proto `ITEM_FLAG_DURABILITY` (bit25, `S/ShareLib/Config.h:648–650`). DB a_durability wczytuje `Item.cpp:420–422`, nowe instancje mają now=max=proto (`Item.cpp:1285–1287`). `Battle.cpp:116–148` uruchamia zużycie broni atakującego i zbroi obrońcy. `PC.cpp:7317–7427` odejmuje1 od wyposażonych flagowanych itemów (zbroja: helmet/body/legs/shield/gloves/boots/accessory1..3/backwing), dopóki now>=10; zejście do9 wywołuje CalcStatus. `getCalcWear`, `WearInvenManager.cpp:2133–2169`, zwraca NULL dla sealed oraz dla durability<10, także underlying composite. To wyłączenie wkładu całego itemu, nie płynna utrata procentu mocy. Idle nie importuje/storuje durability.

## Heaven/Smelting: dokładne szanse i rezultaty

`Item.cpp:433–438` mapuje id84 na normalRefineItem,85 na specialRefineItem. Właściwy handler **wybiera wariant po DB `a_num_0`**, nie samym angielskim name/id: `IETC_UPGRADE_GENERAL=0`,`SPECIAL=1` (`S/ShareLib/Config.h:805–806`), type ETC/subtype UPGRADE (`doFuncItem.cpp:2848–2855`). Do pełnego przypisania nazw potrzebny zgodny wiersz t_item. Poniżej założono te zgodne warianty num0 i domyślny brak eventu.

`do_ItemUpgradeReq`, `S/GameServer/doFuncItem.cpp:2723–2941`: upgrade dotyczy noszonego gear, wyklucza costume2/lent, waliduje composite i bieżący plus, CanUpgrade. Normal/special można stosować do proto level<146; od146 tylko rune albo platinum (:2900–2921). Dla stone instance flag!=0 sprawdza zakres i flag>=effective item level (:2925–2940); dlatego Smelting Stone nie jest samym stackiem itemId+count.

| Rodzaj / obecny plus p |     Sukces +1 |  -1 | Destroy |   Unchanged |
| ---------------------- | ------------: | --: | ------: | ----------: |
| GENERAL,p<3            |        50−2p% |   0 |       0 |      reszta |
| GENERAL,3<=p<18        | max(1,50−2p)% |   0 |  reszta |           0 |
| GENERAL,p>=18          |  max(1,67−p)% |   0 |  reszta |           0 |
| SPECIAL,p<3            |        60−3p% |   0 |       0 |      reszta |
| SPECIAL,3<=p<18        |        60−3p% | 13% |      7% |      20+3p% |
| SPECIAL,p>=18          |         28−p% |  5% |      5% | 90−success% |

Źródła: GENERAL `doFuncItem.cpp:2978–3004`; SPECIAL :3020–3085. Przy SPECIAL p>=18 ujemne upprob zmienia na1, ale zero nie; przy default cap25 ten szczegół nie występuje. Event zmienia tylko upprob SPECIAL `u=trunc(u*g_nUpgradeProb/100)` (:3029–3033,:3063–3064); stałe pasma ryzyka pozostają7/13 albo5/5. Przy dużym event mnożniku faktyczny success ogranicza zakres losowania (max80% przed18/max90% od18), nie osobny clamp. GENERAL nie korzysta tu z eventu.

Przykłady SPECIAL: próba z+0 60%+1/40%unchanged; z+3 51%+1/13%-1/7%destroy/29%unchanged; z+10 30%+1/13%-1/7%destroy/50%unchanged; z+14 18%+1/13%-1/7%destroy/62%unchanged. Idle do+10 ma własne znacznie bezpieczniejsze prawdopodobieństwa.

Rezultaty: PLUS zwykle+1 (`doFuncItem.cpp:3322–3341`); MINUS bez protection -1 (:3493–3502); NOCHANGE pozostawia item (:3506–3517); BROKEN usuwa noszony item i w razie composite także underlying (:3520–3543). Każdy zakończony attempt zużywa1 stone, dodatkowy protection item także1 (:3615–3626). Wśród innych typów lucky gwarantuje+1 do obecnego+5, chaos do+11, super-special do+13 i raz na item, platinum ma osobne zasady (:3007–3017,:3088–3143). Nie są one tą samą tabelą co Heaven.

Protection: `doFuncItem.cpp:3147–3310` przy broken/minus może zmienić wynik na unchanged dla low protection przy realPlus3..9 lub minus dla wyższych zakresów; szczegóły zależą od itemId ochrony, platinum offset, composite i lokalizacji. Range/id z `S/ShareLib/Config_Localize.h:59–64`. Handler odrzuca niepasujące poziomy ochrony (:2823–2844). Nie wolno przenosić pojedynczej szansy „upgrade failure” bez tego kontekstu.

Limit: `MAX_UPGRADE_PLUS=25` w odczytanych plikach lokalizacji (`S/ShareLib/Config_Localize_USA.h:49`, gamigo:218, KOR:52, BILA:74, RUS:51,TLD:46); nie15. Platinum może mieć dalszą osobną ścieżkę. `doFuncItem.cpp:2955–2963` pilnuje limitu. Idle MAX_PLUS15 i safety+10 są oddzielną decyzją projektową.

Runtime: `S/GameServer/Server.cpp:296–297` startuje upgrade event=false i multiplier100; :1491–1517 warunkowo czyta daty/prob ze stanu `UPGRADE_EVENT_AUTO_SAVEFILE`; :6222–6240 ustawia event zależnie od okna czasu. Nie odczytywano plików runtime z sekretami. Gałęzie lokalizacji wybiera `S/ShareLib/Config_Localize.h:8–25`; `DURABILITY`, `_COMPOSITE_ITEM_UPGRADE_BUG_FIX`, event persistence występują w lokalnych headerach, co dowodzi obecności kodu, nie flag użytych w produkcyjnym buildzie. Nie ustalono aktywności `HOLY_WATER` w docelowej wersji.

Smelting jako produkcja: `do_ItemRefinReq`, `S/GameServer/doFuncItem.cpp:3633–3780`: zużywa nienoszony weapon/armor level1..145 z plus0, pobiera koszt `((L+1)*(L+3)*(L−1)+100)/4`. Zwykle weapon daje2 normal stones,armor1; specjalny wynik daje1 Heaven. Wynik special losowany na1..10000 z poziomowego spb; `BUGFIX_REFINE_SPECIAL_ITEM` przełącza wzór broni na armor-factor15, a `DISABLE_REFINE_SPECIAL_STONE` wyłącza special wynik (:3715–3748). Stones normal powstają z instance flag=L (:3751–3761). **Nie znaleziono tej ścieżki jako wymiany10x84->85**; taka wymiana w Idle jest jawnie własną regułą.

## Co musi być ustalone przed migracją

1. Docelowy build/region/feature defines i zgodny dump DB (2018 server/client kontra2015 Nemesis); potwierdzić aktywny combat path i lokalizację.
2. Które własne reguły zostają: osiągalne i bezpieczne+10, brak destroy, max15, exchange10, automatyczne opcje600s, special rare77, sprzedaż Heaven w każdej strefie (`I/src/game/logic/shop.ts:125–145`), własne60% lupy. Komentarze jawnie przypisują właścicielowi osiągalność+10, exchange10,600s,special77 i sprzedaż85 wszędzie; pozostałe są obecnym własnym modelem. Audyt sam żadnej z tych reguł nie uchyla.
3. Dodatkowy model danych: odrębne kanały combat, raw STR/DEX/INT/CON i HP/MP, runtime flags, plus2, item level2, durability, origin/socket/set/belong/lent/sealed/composite, ewentualne protection/rune states. Bieżący import nie dostarcza tych prerekwizytów.
4. Sprawdzić sumy rare probabilities, brakujące proto/opcje i grade=-1; zdecydować jawnie, czy zachować normalizację Idle przy dopisanych special77. Bez tego można zmienić dystrybucję istniejących zestawów.
5. Rozdzielić w dokumentacji „kolumna z DB” od „algorytm/units z serwera”. Przedstawienie `a_prob` jako bezpośrednich wag oraz 66 jako crit damage nie jest dowiedzioną zgodnością z2018.

Nie wykonywano testów aplikacji: to audyt statyczny bez zmiany logiki. Etap audytu nie obejmował wdrożeń; raport nie jest zgodą na wdrożenie niszczenia gear ani zmianę jawnych decyzji właściciela.

# Audyt LC → IdleLC: nagrody, drop, ekonomia, mikstury i progresja

> Raport źródłowy z analizy 2026-11-02, porównujący stan IdleLC `c9944c9` przed wdrożeniem. Opisy „obecnie”, „bez zmian” i numery linii IdleLC dotyczą tego punktu odniesienia. Aktualny stan wdrożenia: [przekazanie prac](../development-handoff.md). Pochodzenie i prefiksy źródeł: [indeks audytu](README.md).

Audyt tylko do odczytu; nie uruchamiano oryginalnych binariów. Zakres: lokalne PvE. `S` oznacza `główny katalog archiwum serwera 2018`, `C` oznacza `główny katalog archiwum klienta 2018`, `I` oznacza `główny katalog repozytorium IdleLC`. Podane `plik:linia` odnoszą się do tych katalogów. Limit 100 i cztery udostępnione mapy IdleLC to świadoma decyzja właściciela, nie błąd do rozszerzenia do 185.

## Najważniejsze ustalenia

| Obszar            | Oryginalne LC                                                                                                                        | Obecne IdleLC                                                                              | Wniosek migracyjny                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| EXP/SP solo       | Baza NPC × kara różnicy poziomu × udział obrażeń, następnie osobne całkowitoliczbowe losowania ±10%, minimum 1 i dalsze modyfikatory | `killReward()` oddaje bazowe `exp/gold/sp`; raport mnoży przez zabicia                     | Zastąpić wypłatę bazową funkcją nagrody przyjmującą poziom gracza i kontekst.                                          |
| Zwykły drop       | Cztery próby; każda losuje jeden z **20 slotów**, następnie testuje jego prawdopodobieństwo                                          | Każdy zachowany wpis tabeli testowany osobno przy każdym zabiciu                           | Obecny model przeciętnie zawyża bazowe sztuki z każdego slotu pięciokrotnie i zmienia rozkład.                         |
| Gold/Nas          | Zdarzenie losowe: bazowo 80%, kara 5 pp za każdy poziom ponad NPC; ilość 50–150% `a_prize`                                           | Gwarantowane pełne `a_prize` na zabicie                                                    | Trzeba oddzielić szansę od ilości i uwzględnić różnicę poziomów.                                                       |
| Smelting Stone 84 | W zwykłym dropie: pochodzi ze slotu NPC i otrzymuje flagę równą poziomowi NPC                                                        | Dodatkowe 1% dla każdego NPC                                                               | Brak potwierdzenia globalnej reguły 1%; to własna reguła IdleLC.                                                       |
| Heaven Stone 85   | Dodatkowa funkcja z szansą zależną od poziomu NPC, poza tabelą NPC                                                                   | Brak tej funkcji; tylko wpisy tabeli i sklep                                               | Właściwy odnaleziony globalny drop kamienia dotyczy **85**, nie 84.                                                    |
| Zwykłe akcesoria  | Źródłem są m.in. konkretne sloty NPC; opcje przy stworzeniu dropu zależą od poziomu zabitego NPC                                     | Dodatkowe 0,5% rozdzielane odwrotnością ceny; opcje losowane lokalnie                      | Dodatkowa szansa/cennik jako waga to decyzja IdleLC. Część tych samych akcesoriów już jest w zaimportowanych tabelach. |
| Sklepy            | Ceny/rates i asortyment konkretnego sprzedawcy z DB; rachunek całkowitoliczbowy                                                      | Jedna modalna stawka całej DB, kupno `ceil`, sprzedaż `floor`; wybór tierów własny         | Zachować udokumentowane uproszczenia sklepu albo importować stawki per NPC/mapa.                                       |
| Mikstury          | Skill wskazany przez item, zwykle poziom `a_num_1`; okresowe efekty HP/MP w ticku 1 s                                                | Importer wybiera zawsze poziom 1 i pierwszy magic; leczenie płynne; cooldown według `kind` | Dla obecnych 16 mikstur dane wskazują poziom 1, ale schemat importu nie odwzorowuje całej semantyki.                   |
| AFK               | Audytowany system `Expedition` to grupa rajdowa do 32 graczy                                                                         | Symulacja wyprawy offline 8 h, 100% tempa próby                                            | Zachować jako funkcję IdleLC; przenieść do niej te same reguły PvE, nie szukać odpowiednika w `CExpedition`.           |

## 1. EXP i SP za zabicie

Przepływ śmierci NPC: `S/GameServer/Battle_ProcDead_NPC.cpp:239–242` wyznacza gracza z pierwszeństwem, średni poziom atakujących i łączne obrażenia; `:466–470` rozdziela EXP/SP, potem wykonuje drop. Średnia do dropu jest **zwykłą średnią poziomów unikalnych właścicieli atakujących**, zaokrągloną dzieleniem całkowitym, nie średnią ważoną damage: `S/GameServer/Battle.cpp:369–379,413–419`. Dla pojedynczego bohatera jest to jego poziom. Wybór pierwszeństwa uwzględnia bonus 20% HP NPC za pierwszy atak i próg większości (`:300–337,406–408`); lokalne solo można przyjąć jednoznacznego właściciela.

Bazy pochodzą z `t_npc.a_exp`, `a_skill_point`, a Nas z `a_prize`: `S/GameServer/NPCProto.cpp:222–226`. Dla `d = playerLevel − npcLevel`:

- `EXPpenalty(d) = 100%` dla `d≤0`; dla `d=1,2,3,4,5,≥6`: odpowiednio **95,90,75,60,45,10%**. Kod używa tablicy, nie stałej `DOWN_LEVEL_EXP`: `S/GameServer/Battle_DivisionExpSP.cpp:19–20,1358–1369`.
- `SPpenalty(d) = 100%` dla `d≤0`; dla `1≤d≤10`: `100−10*d` procent; powyżej 10: 0%. Stałe i funkcja: `S/ShareLib/Config.h:956–958`, `S/GameServer/Battle_DivisionExpSP.cpp:1372–1384`.
- `rawExp = trunc(baseExp * EXPpenalty * playerDamage / (100*totalDamage))`; analogicznie SP. Następnie osobno `value += trunc(value * randomInteger(-10,10)/100)`. To istotne przy małych nagrodach i przy ujemnym składniku: JS `Math.floor()` nie zastępuje C++ truncowania do zera. `S/GameServer/Battle_DivisionExpSP.cpp:143–156`.
- Po bonusie nauczyciela/gildii i przed dalszymi bonusami obowiązuje `max(1,value)`; SP z kary 0 nie staje się ostatecznie zerem: `:158,191–230`. Nauczyciel musi być online; bonus ucznia 5%, nauczyciela 2% w `:1387–1405`.

`PREMIUM_CHAR` zmienia bazę na `int(base*1.1f)` dla pierwszego typu premium i zależy od gracza z pierwszeństwem (`S/GameServer/NPCProto.cpp:85–127`; dispatcher `Battle_DivisionExpSP.cpp:39–55`). Nie jest to bezwarunkowy globalny bonus.

`I/src/game/logic/rewards.ts:82–86,103–108` wypłaca wartości DB bez powyższych reguł. `rewardBonuses()` zwraca zera (`:59–72`) i nie jest używane przy wypłacie; samo zapełnienie tej funkcji niczego nie zmieni. `afk.ts:114,140,155–157` także bezpośrednio używa baz.

## 2. Kolejność modyfikatorów i party

Nagroda solo z sekcji 1 trafia do `CPC::AddExpSP(...,true,...)` (`S/GameServer/Battle_DivisionExpSP.cpp:352`). To pipeline, nie pojedyncze sumowanie procentów:

1. Dungeon-time strefy przed zapamiętaniem `nOrgExp/nOrgSP`: `S/GameServer/PC.cpp:975–986`.
2. Event globalny EXP/SP (`EVENT_DOUBLE`, `NEW_DOUBLE_EVENT_AUTO`, opcjonalnie filtr mapy `NEW_DOUBLE_GM_ZONE`), osobny EXP event i długi zestaw assistów/scrolli/attendance: `:995–1151`. Część jest multiplikatywna, część dodaje procent bieżącej wartości; liczy się kolejność i każde dzielenie.
3. Bonusy opcji `m_opExpRate/m_opSPRate`, flat `assist.exp/sp`, następnie rate `exp_rate/sp_rate`: `:1162–1173`.
4. Limity mnożenia względem `nOrgExp/nOrgSP`, sterowane stanem serwera i assistami, oraz wyjątki określonych mikstur: `:1175–1234`. Limity są profilowane/regulowane w runtime, nie należy wnioskować aktywnego mnożnika z samych źródeł.
5. Dodatki po limitach, opcja speed-server/mapa (`IMP_SPEED_SERVER`), bonus artifact i zapis: `:1243–1297`.

Wcześniej konsumpcyjne boostery preferowanego gracza mogą dać EXP/SP ×4, a `NEW_ACCERY_ADD` dodaje własny procent (`S/GameServer/Battle_DivisionExpSP.cpp:232–305`). Gildia może odebrać wkład EXP (`:191–223`). Wszystkie te dodatki wymagają rzeczywistego stanu postaci/eventu; brak aktywnych danych nie upoważnia do włączenia ich domyślnie.

Party to odrębne rozdzielenie żywym członkom w zasięgu (`S/GameServer/Battle_DivisionExpSP.cpp:421–440`). Dla `n>1`: EXP `% = 100+10+countBonus[n−1]`, gdzie tablica dla 1…8 wynosi `[20,35,50,65,80,95,105,115]`; SP `% = 100+10+6*(n−1)` (`:388–389,471–489`, stałe `S/ShareLib/Config.h:1012–1013`). Potem stosuje kary i dzieli wg rodzaju party: EXP 75% według poziomu+25% równo albo 70% damage+30% poziom (`:568–590`); dodatkowe ograniczenia za duże różnice poziomów w `:629–634,802–805`. To nie jest stałe `+10%` dla każdego solo. Lokalna reprezentacja PvE może jawnie obsługiwać wyłącznie solo; wdrożenie pełnego party nie jest potrzebne do naprawy solo.

## 3. Zwykły drop, liczba sztuk i brakujące tabele

Stałe: `MAX_NPC_DROPITEM=20`, `MAX_NPC_DROPITEM_LOOP=4` w `S/ShareLib/Config.h:356–358`. Zwykły przebieg: `S/GameServer/Battle_NPCDropItem.cpp:79–115,196–238`:

1. Gdy średni poziom atakujących nie jest `−1` i nie przekracza `npcLevel+5`, wykonać 4 próby.
2. W każdej wybrać równomiernie jeden z **pełnych 20 slotów**, także pustych. Następnie test `randomInteger(1,10000)≤modifiedPercent[slot]`.
3. Udany standardowy wpis daje **jedną sztukę**; kilka prób może wybrać ten sam slot, więc można dostać kilka sztuk. Domyślnie maksymalnie 4 zwykłe dropy, lecz niezależne tabele/funkcje mogą dodać kolejne przedmioty.

Dla pojedynczego slotu z bazowym `p` w jednostkach 1/10000 i bez bonusów: oczekiwana liczba sztuk = `4*p/(20*10000)`, prawdopodobieństwo co najmniej jednej sztuki = `1−(1−p/(20*10000))^4`. Przykład `p=10000`: **0,2 sztuki/kill** i **18,5494% na ≥1**, a nie gwarantowana sztuka. Dla powtórzonego item id sumuje się prawdopodobieństwa jego slotów, zachowując wspólny limit prób.

Serwer ładuje sloty kolejno i **kończy na pierwszym item id `−1`** (`S/GameServer/NPCProto.cpp:280–305`). Importer IdleLC (`I/scripts/lc/import-db.mjs:116–124`) filtruje wszystkie 20 do `{item,chance}`, gubi pozycję i puste/zerowe sloty, a nie odtwarza warunku końca. `I/src/game/logic/loot.ts:75–89` robi niezależny Bernoulli dla każdego wpisu. Trzeba ponownie zaimportować surowe sloty/procenty (albo równoważną pełną strukturę 20 slotów) i zachować `a_minplus/a_maxplus/a_probplus`; oryginał może także nadać losowy plus dropowi (`Battle_NPCDropItem.cpp:249–254`).

Zwykły `dropprob` przechodzi przez `m_itemDropProb`, scroll/assist, `m_nItemDropEventRate`, warunkowe `DOUBLE_ITEM_DROP`, jednorazowe boostery ×10/×20 i warunkowy `IMP_SPEED_SERVER`/mapa (`S/GameServer/Battle_NPCDropItem.cpp:117–194`). Nie wszystkie dodatkowe dropy używają tej samej ścieżki. `m_itemDropProb` i `m_moneyDropProb` są ładowane z **`t_drop_prob`**; pierwszy jest ograniczony do [50,300] (`S/GameServer/Server.cpp:3412–3431`). To definicja wzoru i zakresu, nie ustalenie aktywnej konfiguracji.

Poza zwykłą tabelą są jeszcze: osobny drop klasowy z `t_npc_dropjob` (`NPCProto.cpp:395–431`, `Battle_NPCDropItem.cpp:294–321`); **każdy** wpis `t_npc_drop_all` testowany osobno bez limitu różnicy poziomów (`NPCProto.cpp:436–454`, `Battle_NPCDropItem.cpp:325–358`); tabela jewel z własnymi próbami (`Battle_NPCDropItem.cpp:360–414`); liczne funkcje hardcoded i aktywne eventy (`:417–493`). Automatyczne eventy korzystają z `t_drop_item_head` i `t_drop_item_data`, w tym `a_count`, trybu multi/once i warunków level/job (`S/GameServer/DropItem.cpp:15–118,145–152,179–285`). Zatem brak ilości `count` przy podstawowym `t_npc.a_item_N` jest poprawny, ale `count` nie wolno pomijać w systemie eventowym.

Wyjątki profili: `EXTREME_CUBE` może ominąć level gate; `EVENT_WORLDCUP_2010` zmienia próby dla NPC1105; `LC_USA/LC_BILA` zamieniają część healing potionów i blokują niektóre itemy (`Battle_NPCDropItem.cpp:74–107,202–224`). `LC_TLD` dzieli szanse broni/zbroi level≥50 przez 2 podczas ładowania (`NPCProto.cpp:294–303`). Nie przenosić wszystkich wariantów jednocześnie.

## 4. Kamienie i akcesoria

**Smelting 84:** znaleziony zwykły drop tworzy 1 sztukę z `flag=npcLevel` (`S/GameServer/Battle_NPCDropItem.cpp:198–200`). W dispatcherze i wywołanych funkcjach kamieni nie znaleziono reguły globalnego 1% dla 84; `DropLuckySpecialStone()` jest **pustym stubem** (`S/GameServer/hardcoding.cpp:455–457`). `GENERAL_DROPS` w `I/src/game/logic/loot.ts:10–14` jest jawnym własnym założeniem. W aktualnym `lc-data.json` item84 znajduje się w dwóch slotach jednego NPC152, oba raw chance=0,2; nie w uniwersalnej tabeli.

**Heaven 85:** `DropSpecialRefineStone()` jest wywoływane z dispatchera (`S/GameServer/Battle_NPCDropItem.cpp:421`) i daje **dodatkową** próbę, również gdy NPC ma 85 w tabeli. Wzór: mob level≤140, średni level atakujących≤mob+5; `prob=trunc((2*mobLevel+25)/10)` na 10000. Personal dungeon dzieli przez 2; `LC_TLD` dodaje 10%, `LC_BILA` dzieli przez 2 (`S/GameServer/hardcoding.cpp:701–724`). Np. level1 → 2/10000 = 0,02%; level100 → 22/10000 = 0,22%, przed wyjątkami. Funkcja nie przechodzi przez globalny mnożnik zwykłego dropu. `DropNewMoonStoneItem()` daje osobno box2544: 90/10000, personal dungeon połowę, ten sam gate poziomu (`:844–857`).

**Akcesoria:** dodatkowe globalne 0,5% i wagi `1/price` istnieją tylko w `I/src/game/logic/loot.ts:16–35`. Nie znaleziono ich w oryginalnym dispatcherze. Ważna korekta względem komentarza importera `import-db.mjs:185`: aktualne wygenerowane dane mają **48 wpisów dropu** w zwykłych slotach dla 10 id z `accessories`, np. NPC115→164 raw0,005, NPC1→174 raw0,006. Dodatkowa tabela IdleLC dokłada zatem także do istniejących źródeł. Przy udanym original dropie accessory `CArea::DropItem()` tworzy opcje, bazując na **poziomie NPC przekazanego jako `ch`**, nie cenie (`S/GameServer/Area.cpp:1342–1444`); szczegóły opcji w raporcie items. Odnotowany brak globalnej szansy jest wynikiem audytu tej ścieżki, nie dowodem, że dowolna nieotrzymana konfiguracja eventów nigdy nie doda accessory.

## 5. Nas i sklep

`S/ShareLib/Config.h:960`, `S/GameServer/Battle_NPCDropItem.cpp:495–528`:

`moneyProb = trunc(8000 * runtimeMoneyRate / 100) + min(0,npcLevel−attackerAvgLevel)*500`.

Test `randomInteger(1,10000)≤moneyProb`; wartości ujemne nigdy nie przechodzą. Jeśli przejdzie, `count = trunc(a_prize * randomInteger(50,150)/100)`. Przy neutralnym mnożniku runtime i równych levelach średnia przed zaokrągleniem jest **0,8\*a_prize/kill**, a przy graczu o 6 poziomów wyżej — 0,5*a_prize/kill; nie gwarantowane `a_prize`. Później globalny event Nas, boostery, opodatkowanie dungeon, bonusy passive/artifact i rozdział party (`:530–608`). `LC_RUS` ma redukcję dla NPC65+ poza wskazaną mapą (`:530–534`). W solo Nas jest dodawany do inventory money, nie pozostawiany jako widoczny stos na ziemi (`:593–608`).

Sklep ładuje rates **konkretnego keepera** z `t_shop` i ofertę z `t_shopitem` (`S/GameServer/Zone.cpp:464–518`), uwzględniając filtr narodowy z wyjątkiem m.in. `LC_GAMIGO`. Zakup: `trunc(a_price*buyRate/100)*count` (`S/GameServer/doFuncItem.cpp:2348–2360`); dodatki passive po sumie (`:2378–2386`). Sprzedaż: analogicznie `sellRate`, w gałęzi `LC_USA` item level≥97 za połowę; są flagi zezwolenia na sprzedaż i dodatki passive (`:2583–2635`). Plusy/opcje nie występują w podstawowym wzorze ceny tej ścieżki.

Importer wybiera najczęstsze rates z **całego** `t_shop` (`I/scripts/lc/import-db.mjs:276–282`); aktualny artifact ma sell40/buy100. To liczby danych aktualnego importu, nie uniwersalne stałe LC. `I/src/game/logic/shop.ts:31–34,102–103` ma `floor` sprzedaży i `ceil` kupna; `ceil` różni się od oryginału przy ułamku. Minimum 1 gold za starter gear (`:28–34`), wybór słabszego itemu z tieru (`import-db.mjs:503–549`), Heaven Stone we wszystkich mapach (`shop.ts:125–144`) i magnifiers wszędzie (`import-db.mjs:44–47`) są oznaczonymi decyzjami właściciela. Nie usuwać ich automatycznie jako błędów audytu.

## 6. Mikstury: dane, tick, cooldown i zużycie

Oryginał tworzy skill `item.a_num_0` na poziomie `item.a_num_1`, wyjątek `IPOTION_UP` bierze level z flagi instancji (`S/GameServer/doFuncItem.cpp:13057–13066`). Sprawdza m.in. oba ograniczenia poziomu itemu (`:403–408`) i flagi/duplikację skill (`:13088–13096`), aplikuje przez `ApplySkill()` (`:13105–13137`). Zwykła sztuka znika **po skutecznym użyciu**, nie po zakończeniu efektu (`:1164–1167,1244–1248,1317–1318`); toggle ma osobne wyjątki (`:1284–1314`).

Importer `I/scripts/lc/import-db.mjs:467–500` mapuje `a_num_0` na skill, ale bierze zawsze poziom1 i tylko magicIndex1. Zachowuje power, duration `/10`, reuse `/10`; gubi typ obrażeń/flat-rate, kolejne efekty, skill flags i parametry. Aktualny artifact ma **16** potion entries i wszystkie mają `stats[1]=1`, więc level1 pasuje do tych konkretnych danych. Przykłady: 43 power16, duration15s, cooldown5s; 44 power33/15s/5s; 484 power8/15s/5s; 490 regen+2/600s/5s. Potwierdzone są to dane importu, nie komplet wszystkich potionów w historycznym LC.

HP/MP assist dodaje power raz na wywołanie ticku 1s, flat albo procent max zależnie od `magic.a_damagetype`, z clampem do max (`S/GameServer/Assist.cpp:626–656,2791–2801`; `S/ShareLib/Config.h:128`). Nie ma natychmiastowej aplikacji tego HP/MP w `ApplyMagic` (potwierdzenie w raporcie skills); timing zależy od globalnego ticku, a nie płynnego dzielenia. Efekt zużywa duration w 1/10 s (`Assist.cpp:721–725`); naturalny regen jest odrębnym tickiem3s (`Config.h:1030`), nie czasem tych potionów.

Cooldown oryginalnego klienta jest związany z **id skilla itemu**, a nie z czterema abstrakcyjnymi rodzajami: `C/Engine/Info/MyInfoSkill.cpp:158–170` wylicza reuseTime/10, `C/Engine/Network/SessionStateItem.cpp:1240–1243` rozpoczyna licznik po potwierdzeniu użycia, `C/Engine/Interface/UIInventory.cpp:4876–4912` oznacza itemy z takim samym `num0`. Nie znaleziono osobnego egzekwowania `reuseTime` w audytowanym serwerowym `do_ItemUsePotion`; nie należy przedstawiać client timer jako potwierdzonego serwerowego cooldownu. `SF_NOTDUPLICATE` i reguły assistów to osobne ograniczenie od reuse.

IdleLC auto thresholds HP<50%, MP<30% (`I/src/game/logic/combat.ts:50–52`), wybór najmniejszej wystarczającej mikstury, blokowanie aktywnego efektu tego `kind`, liczniki `kind`, płynne HP/MP (`:755–811`) i dwa quick sloty (`potions.ts:20–31`) są lokalną automatyzacją. Przy wiernym modelu należy zachować skillId/level/flags/magic metadata i tick 1s; auto-use może nadal być polityką IdleLC. Nie trzeba implementować całego oryginalnego UI.

## 7. Progresja, śmierć i AFK

Oryginalny `MAX_LEVEL=185` (`S/GameServer/Exp.h:4`); EXP wymagane do awansu **są z DB**, nie z formuły: `t_exp`, a przy `IMP_SPEED_SERVER` i trybie speed `t_exp_speed` (`S/GameServer/Exp.cpp:8–34`). Awans odejmuje aktualny próg, zwiększa level, przelicza status i przywraca pełne HP/MP (`S/GameServer/PC.cpp:1344–1407,1412–1415`). SP przechowywane jako integer w jednostkach 1/10000 SP (`S/GameServer/doFuncSkill.cpp:145,215`), limit całkowitego salda **2 000 000 000** (`S/ShareLib/Config.h:213`; zapis/clamp `PC.cpp:1296–1319`).

IdleLC ma świadomy `MAX_LEVEL=100`, importuje 100 progów `t_exp`, a brakujące zastępuje własnym `round(30*level^2.2)` (`I/src/game/data/progression.ts:3–17`, `import-db.mjs:268–272`). Aktualny artifact ma komplet100 dodatnich progów, np. level1→34,10→18748,30→4046233,100→16842396049. Zatem fallback nie jest obecnie używany. `gainExp()` zeruje nadmiar na capie (`I/src/game/logic/progression.ts:20–29`), podczas gdy oryginalny zapis utrzymuje EXP na capie do progu (`S/GameServer/PC.cpp:1288–1294`). Zachować limit100; semantykę nadmiaru oznaczyć jako świadomą decyzję. Do literalnego odwzorowania oryginalnych dużych/licznikowych danych zachować dzielenie całkowite i kontrolę zakresów; nie kopiować bezrefleksyjnie dawnego kodu overflow.

Śmierć PvE nie jest obojętna ekonomicznie: przy aktywnej zwykłej karze level≤10 brak straty,11–20 **5%**,21–35 **3%**,36+ **2%**. EXP strata=`trunc(nextLevelExp/100)*rate`; SP strata=`trunc(currentSp/100)*rate`; kolejność dzielenia ma znaczenie. Efekty przedmiotów mogą zmniejszyć karę, personal dungeon ją pomija, combo dzieli przez10, strata jest ograniczana aktualnym EXP/SP (`S/GameServer/Battle_ProcDead_PC.cpp:220–222,244–307,463–487`). `I/src/game/logic/rewards.ts:102,121` i `afk.ts:138,177` tylko zapisują liczbę śmierci. To brak odwzorowania ekonomii śmierci; politykę kary w nieprzerwanym idle trzeba ustalić świadomie, bo istotnie zmieni opłacalność trudnych NPC.

`CExpedition` to grupy4×8, gracze online/offline i tryby podziału (`S/GameServer/Expedition.h:4–7,12–27,71–90`), a nie wyprawa licząca zabicia po wylogowaniu. W audytowanych ścieżkach śmierci/reward/progression nie ma odpowiednika wypłaty offline IdleLC. `I/src/game/logic/afk.ts:16–27,40–59,111–157` używa własnego limitu8h, próby1200s z praktycznie nieograniczonymi miksturami, slice600s i efficiency1. Przy kończeniu zapasu w obrębie slice tempo zmienia się dopiero w następnej slice, choć zużycie jest już przycinane do zapasu. To aproksymacja symulacji, nie oryginalna reguła LC. Po migracji nagród trzeba liczyć EXP/SP/gold/drop przy levelu danej części wyprawy, a nie mnożyć wszystkie zabicia przez jedną bazę; inaczej kary levelowe nie zadziałają po awansie.

## Brakujące wejścia i kolejność wdrożenia

1. **Można wdrożyć na podstawie kodu już teraz:** kary solo EXP/SP, integer RNG ±10%, minima; zwykłe4×20 losowania; bazowy wzór Nas; hardcoded85; tick potion1s. Wspólny kalkulator należy użyć w walce, estymacji hourly i AFK. Oznaczyć baseline eventów/rates jawnie zamiast uznawać go za historyczną aktywną konfigurację.
2. **Potrzebny ponowny import DB:** pełne kolejność/terminator20 slotów NPC, percenty, min/max/probplus, item limits/flags, potions num1 i komplet efektów, keeper rates, `t_drop_prob`, `t_npc_dropjob`, `t_npc_drop_all`, jewel, ewentualnie `t_exp_speed`; dla eventów `t_drop_item_head/data` oraz aktywacje. Obecny `lc-data.json` nie przechowuje tych wejść; sam parser nie odtworzy utraconych slotów z uproszczonych wpisów.
3. **Potrzebna decyzja profilu, nie domysł:** kraj/`LC_*`, build gates i normal/speed. Warianty zmieniają drop i ceny; w `S/GameServer/Makefile:175,256` USA/Gamigo to osobne targety. Nie ma jednej uniwersalnej liczby live EXP/drop event rate wynikającej z tego archiwum. Nie odczytywano sekretów ani wartości plików konfiguracyjnych serwerów.
4. **Polityka IdleLC do zachowania/uzgodnienia osobno:** cztery mapy, cap100, offline8h/efficiency, auto-use potions, minimum sprzedaży startera, uproszczony wybór shop tierów, Heaven/magnifiers wszędzie, ewentualnie dodatkowe drop84/accessory i kara śmierci. Są odrębne od odtwarzania wzorów oryginału.

Ocena pewności: wysoka dla cytowanych aktywnych wzorów i danych obecnego artifactu; zależna od profilu dla `#ifdef`; nieustalona dla historycznych stanów DB/eventów/runtime. W źródłach istnieją stube i zakomentowane stare algorytmy — nie traktowano ich jako czynnych reguł.

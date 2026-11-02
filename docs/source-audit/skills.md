# Audyt umiejętności, magii i efektów LC — źródła listopad 2018

> Raport źródłowy z analizy 2026-11-02, porównujący stan IdleLC `c9944c9` przed wdrożeniem. Opisy „obecnie”, „bez zmian” i numery linii IdleLC dotyczą tego punktu odniesienia. Aktualny stan wdrożenia: [przekazanie prac](../development-handoff.md). Pochodzenie i prefiksy źródeł: [indeks audytu](README.md).

Stan: 2026-11-02. Analiza tylko do odczytu. Nie uruchamiano serwera ani klienta, nie kompilowano i nie zmieniano IdleLC ani oryginalnych źródeł. Przykłady danych pochodzą z obecnego eksportu IdleLC; **nie stanowią dowodu, że oryginalny serwer z 2018 r. miał identyczną bazę**.

Ścieżki używane w cytowaniach:

- `S/` = `główny katalog archiwum serwera 2018/`
- `C/` = `główny katalog archiwum klienta 2018/`
- `I/` = `główny katalog repozytorium IdleLC/`

Najważniejsze ustalenia: mapa magic nie musi już być zgadywana z nazw. IdleLC błędnie utożsamia krwawienie i confusion ze stunem, premię HP z atakiem, szybkość rzucania z szybkością ataku i szansę deadly z mnożnikiem critical. Każdy atak interpretuje jako procent obrażeń, choć oryginał rozróżnia flat/addition/rate. Prawidłowo rozpoznano bazową jednostkę czasów 0,1 s oraz HP/MP assist jako efekty okresowe, ale naturalna regeneracja ma tick **3 s**, nie 5 s. Obecny eksport nie zawiera danych koniecznych do wiernego trafienia, nakładania i warunków efektów.

## 1. Kontrakt danych i faktyczna ścieżka wykonania

`S/GameServer/Skill.cpp:571` ładuje `t_magic`, a linie 598–633 odczytują `type`, `subtype`, `damagetype`, `hittype`, `attribute`, `psp`, `ptp`, `hsp`, `htp`, `togle`, następnie osobno `t_magicLevel.a_power` i `a_hitrate`. To dwie niezależne wielkości. `S/GameServer/Skill.cpp:889` ładuje `t_skill`; linie 941–974 zawierają flagi, zasięgi, target, use/app state i weapons, wymagane efekty, ready/still/fire/reuse, parametry, soul i wearing. `t_skilllevel` wnosi koszty, duration, hate, przedmioty, warunki nauki, trzy magic index/level oraz app magic: `S/GameServer/Skill.cpp:1016` i `:1039`.

Dla aktywnego skilla postaci ścieżka jest następująca:

1. `do_SkillReady`: `CanSpell`, zajętość, dostępność, zasoby, `CheckUseState`, przedmioty/target; potem `skill->Ready(tch)` i `m_currentSkill=skill` (`S/GameServer/doFuncSkill.cpp:957`, `:982`, `:1020`, `:1332`). `Ready` ustawia stan READY i `m_usetime=m_pulse` (`S/GameServer/Skill.cpp:768`, `:803`).
2. `do_SkillFire` wymaga tego samego skilla w READY; ponownie sprawdza target i koszty, zmienia stan na FIRE, odlicza HP/MP i wykonuje efekty (`S/GameServer/doFuncSkill.cpp:1537`, `:1651`, `:1664`, `:1779`, `:1804`, dalszy dispatch poniżej).
3. `ApplySkill`: weryfikacja flag HELP/NOTHELP i wrogości, warunków celu, osobne trafienie każdego z maksymalnie trzech magic; MT_ATTACK idzie do `ProcAttack`, pozostałe do `ApplyMagic`; potem dodanie efektów czasowych z maską `bHit[3]` (`S/GameServer/Skill.cpp:2797`, `:2980`, `:3044`, `:3079`, `:3113`, `:3193`).
4. `CAssist::Add` wybiera help/curse, usuwa duplikaty, zapisuje skill, level, pozostały czas, pozostałą liczbę użyć i maskę trafień, przelicza statystyki (`S/GameServer/Assist.cpp:2477`, `:2486`, `:2592`, `:2598`, `:2612`). `CAssist::Apply` zeruje akumulatory addition/rate, agreguje oba zbiory i wywołuje `ApplyAssistData` (`:2817`).

Klient potwierdza enumy efektów: `C/Engine/Entities/Skill.h:27` zawiera poison=0, confusion=2, blood=5, sturn=7; `C/Engine/Entities/Skill.cpp:224` ładuje ready/wait/fire/reuse oraz `:271` HP/MP/duration. Jego `dummyPower` (`Skill.h:598`) jest polem prezentacji — nie zastępuje serwerowego wykonania trzech magic.

## 2. Dokładne enumy do zastąpienia zgadywanych map

Definicje bazowe: `S/GameServer/Skill.h:55` (MT), `:69` (STAT), `:111` (ASSIST), `:170` (ATTACK), `:178` (RECOVER), `:186` (CURE), `:205` (OTHER), `:255` (damage type), `:278` (skill type), `:290` (target), `:306` (flags), `:324` (conditions). Zachowano oryginalne pisownie `STURN`, `Togel`, `MSG_CURE_ALL`.

| `a_type` | Oryginalna stała | Sens / wykonanie                                            |
| -------: | ---------------- | ----------------------------------------------------------- |
|        0 | MT_STAT          | Zmiana statystyki, zwykle addition/rate; passive lub assist |
|        1 | MT_ATTRIBUTE     | Żywioł; oddzielne znaczenie damagetype: ATTACK=1, DEFENCE=2 |
|        2 | MT_ASSIST        | Stan, DOT, regeneracja okresowa lub specjalna obsługa       |
|        3 | MT_ATTACK        | `ProcAttack`; podtyp i damagetype mają znaczenie            |
|        4 | MT_RECOVER       | Natychmiastowe HP/MP, pet stamina/faith, odzysk exp/SP      |
|        5 | MT_CURE          | Usunięcie stanów / resurrection                             |
|        6 | MT_OTHER         | M.in. cancel, reflect, summon, hate, warp                   |
|        7 | MT_REDUCE        | Redukcja melee/range/magic/skill (podtyp 0/1/2/3)           |
|        8 | MT_IMMUNE        | Podtyp 0 blind; wykonanie zawiera wyjątki probabilistyczne  |
|        9 | MT_CASTLE_WAR    | Efekty oblężenia                                            |
|       10 | MT_MONEY         | Buy=0, sell=1, dodatkowy nas=2                              |

Pełna mapa `MT_STAT` (numer → sufiks `MST_STAT_`):

| Numery | Stałe                                                                                                        |
| ------ | ------------------------------------------------------------------------------------------------------------ |
| 0–9    | ATTACK, DEFENSE, MAGIC, RESIST, HITRATE, AVOID, CRITICAL, ATTACKSPD, MAGICSPD, MOVESPD                       |
| 10–19  | RECOVERHP, RECOVERMP, MAXHP, MAXMP, DEADLY, MAGICHITRATE, MAGICAVOID, ATTACKDIST, ATTACK_MELEE, ATTACK_RANGE |
| 20–29  | HITRATE_SKILL, ATTACK_80, MAXHP_450, SKILLSPD, VALOR, STATPALL, ATTACK_PER, DEFENSE_PER, STATPALL_PER, STR   |
| 30–38  | DEX, INT, CON, HARD, STRONG, NPCATTACK, NPCMAGIC, SKILLCOOLTIME, DECREASE_MANA_SPEND                         |

Pełna mapa `MT_ASSIST` (numer → sufiks `MST_ASSIST_`):

| Numery | Stałe                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 0–9    | POISON, HOLD, CONFUSION, STONE, SILENT, BLOOD, BLIND, STURN, SLEEP, HP                                                           |
| 10–19  | MP, MOVESPD, HP_CANCEL, MP_CANCEL, DIZZY, INVISIBLE, SLOTH, FEAR, FAKEDEATH, PERFECTBODY                                         |
| 20–29  | FRENZY, DAMAGELINK, BERSERK, DESPAIR, MANASCREEN, BLESS, SAFEGUARD, MANTLE, GUARD, CHARGEATC                                     |
| 30–39  | CHARGEMGC, DISEASE, CURSE, CONFUSED, TAMING, FREEZE, INVERSE_DAMAGE, HP_DOT, REBIRTH, DARKNESS_MODE                              |
| 40–49  | AURA_DARKNESS, AURA_WEAKNESS, AURA_ILLUSION, MERCENARY, SOUL_TOTEM_BUFF, SOUL_TOTEM_ATTK, TRAP, PARASITE, SUICIDE, INVINCIBILITY |
| 50–54  | GPS, ATTACK_TOWER, ARTIFACT_GPS, TOTEM_ITEM_BUFF, TOTEM_ITEM_ATTK                                                                |

Pozostałe istotne podtypy:

- `MT_ATTACK`: 0 NORMAL, 1 CRITICAL, 2 DRAIN, 3 ONESHOTKILL, 4 DEADLY, 5 HARD. IdleLC obecnie zlewa wszystkie do jednego rodzaju damage (`I/src/game/logic/skills.ts:104`).
- `MT_RECOVER`: 0 HP, 1 MP, 2 STM, 3 FAITH, 4 EXP, 5 SP.
- `MT_CURE`: 0 POISON, 1 HOLD, 2 CONFUSION, 3 STONE, 4 SILENT, 5 BLOOD, 6 REBIRTH, 7 INVISIBLE, 8 STURN, 9 SLOTH, 10 NOTHELP, 11 BLIND, 12 DISEASE, 13 CURSE, 14 `MSG_CURE_ALL`, 15 INSTANTDEATH.
- `MT_OTHER`: m.in. 0 INSTANTDEATH, 1 SKILLCANCEL, 4 REFLEX, 8 TOUNT, 9 SUMMON, 10 EVOCATION, 14 SOUL_DRAIN, 15 KNOCKBACK, 16 WARP, 17 FLY, 18 EXP, 19 SP, 20 ITEMDROP, 21 SKILL, 30 `MSG_OTHER_SUMMON_NPC`. Samo istnienie stałej nie dowodzi obsługi przez każdy dispatch; trzeba sprawdzić wykonawcę konkretnej kombinacji.
- Typy umiejętności: 0 MELEE, 1 RANGE, 2 MAGIC, 3 PASSIVE, 4 PET_COMMAND, 5 PET_SKILL_PASSIVE, 6 PET_SKILL_ACTIVE, 7 GUILD_SKILL_PASSIVE, 8 SEAL, 9 SUMMON_SKILL. Oryginał klasyfikuje jako passive także 5 i 7 (`S/GameServer/Skill.cpp:173`), IdleLC wyłącznie 3 (`I/src/game/logic/skills.ts:155`). Aktualny importer ogranicza się do sześciu klas bazowych i `job2=0` (`I/scripts/lc/import-db.mjs:687`).

Ważny szczegół bitów: `AST_*` nie jest uniwersalnie `1 << subtype`. Dla DISEASE i CURSE jest przesunięcie `subtype-2`, a CHARGE nie mają tych bitów (`S/GameServer/Skill.h:364`). Do zapisu stanu nie wolno wyprowadzać bitów samodzielnie z tabeli numeric subtype.

## 3. Jednostki mocy, trafienie i statystyki

`SKILL_RATE_UNIT` ma **wartość 100**, choć komentarz obok mówi 10000 (`S/GameServer/Skill.h:6`). Dla stat rate i heal rate 10 oznacza 10%; nie jest to globalna jednostka szans. `UNIT_SKILLPOINT=10000` (`:18`) dotyczy SP. `MHT_CONSTANT` losuje w 1..10000 i porównuje z **a_hitrate**, po modyfikacjach (`S/GameServer/Battle_GetDamage.cpp:250`, `:333`, `:383`). Dla MT_ATTACK `ProcAttack` ma dodatkowy wstępny rzut H-vs-A przed `SelectHitType` (`S/GameServer/Battle.cpp:79`); MHT_CONSTANT nie omija go globalnie. Dla pozostałych efektów ścieżka jest inna. Moc 0 w stunie nie oznacza automatycznie 100% trafienia. IdleLC odczytuje szansę z `power`, a brak/zero uznaje za 100%, potem dokłada wspólne trafienie ataku (`I/src/game/logic/skills.ts:94`, `I/src/game/logic/combat.ts:669`, `:703`).

`MDT_ONLYPOWER=0`, `MDT_ADDITION=1`, `MDT_RATE=2` nie mogą być redukowane do boolean percent we wszystkich rodzinach:

- **Atak:** 0 zwraca moc jako obrażenia we wczesnym return; 1 ustawia addytywny składnik; 2 ustawia osobny rate. W tym snapshotcie dawne `A += A*rate/100` jest zakomentowane, a aktywny odczyt rate znajduje się w gałęzi `if(nMagicPowerAddition)`; sam RATE nie skaluje tam A. ADDITION dodaje power do skalowanej części bazowej, nie robi `normalHit*(1+power/100)`. Dowód: `S/GameServer/Battle_GetDamage.cpp:608`, `:639`, `:853`, `:863`, analogicznie `:1094`, `:1293`. Szczegóły formuły i regionalnej gałęzi `LC_JPN_SKILL_CRITICAL` należą też do raportu walki. IdleLC ma własny mnożnik `1+power/100` (`I/src/game/logic/balance.ts:62`) i ignoruje damageType.
- **Statystyki:** APPVAL zbiera tylko ADDITION do addition i RATE do rate; ONLYPOWER nie jest równoznaczne z flat stat (`S/GameServer/Assist.cpp:17`, `S/GameServer/Character.cpp:1163`). IdleLC traktuje każde `damageType != 2` jako flat (`I/src/game/logic/skills.ts:91`). Rate'y tej samej grupy są sumowane w akumulatorze przed zastosowaniem; IdleLC mnoży kolejne procenty w kolejności efektów (`:391`). Dla maxHP +10% i +10% tej samej grupy oryginał stosuje +20%, IdleLC +21%; passive i assist pozostają osobnymi etapami, więc nie należy łączyć wszystkich grup na ślepo.
- **RECOVER HP/MP:** 0 daje flat resource; 2 daje `maxResource*power/100`; 1 jest uznane za błędne dane i przerywa (`S/GameServer/Skill.cpp:1840`, `:1906`). IdleLC zawsze dodaje flat power (`I/src/game/logic/skills.ts:106`, `I/src/game/logic/combat.ts:678`).
- **Parametry:** `CalcSkillParam` daje 100, jeśli którykolwiek uczestnik nie jest PC. Dla PC/PC jest `100+(selectedSelfStat-selectedTargetStat)/2` z clampem (`S/GameServer/Skill.cpp:3277`). Power i hitrate używają różnych selektorów. Dzielenia w oryginale są w wielu miejscach całkowitoliczbowe; np. duration używa `remain*(param/100)` (`S/GameServer/Assist.cpp:103`), co nie jest równoważne przestawieniu kolejności mnożenia/dzielenia.

Istotne zamienniki dla obecnej mapy `I/src/game/logic/skills.ts:67`:

|     Podtyp | Faktyczne działanie                                                                | Stan IdleLC                                                                                                  |
| ---------: | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
|    STAT 14 | DEADLY, osobna szansa silnego rodzaju trafienia                                    | `critMultiplier` — błąd semantyki                                                                            |
|    STAT 22 | MAXHP_450: osobno limit flat i rate do maks. 450 HP                                | `attack` — błąd; dowód cap: `S/GameServer/Character.cpp:431`                                                 |
|    STAT 23 | SKILLSPD: rate trafia do `m_skillSpeed`; readyTime mnożone przez `(100-speed)/100` | `attackSpeed` — błąd; `Character.cpp:391`, `doFuncSkill.cpp:1561`                                            |
|     STAT 8 | MAGICSPD: modyfikuje `m_magicSpeed`; ta wartość dodawana do reuse                  | dodatni/ujemny bonus do castTime; inne znaczenie (`Character.cpp:389`, `Skill.cpp:684`)                      |
|     STAT 7 | Zmniejsza attack interval: flat, potem `interval -= interval*rate/100`             | RATE dzieli przez `1+rate/100`; +10% daje 0,9× w LC, ~0,909× w IdleLC (`Character.cpp:387`, `skills.ts:407`) |
|     STAT 9 | Prędkość ruchu: flat `power/10` jednostki prędkości, potem rate                    | obecnie brak mapowania; nie jest czystym procentem podróży (`Character.cpp:417`)                             |
| STAT 37/38 | Cooltime i redukcja kosztu MP                                                      | brak mapowania z magic, mimo obecności własnych statów redukcji w IdleLC                                     |
|   STAT 2/3 | Oddzielny magic attack / resist                                                    | scalone do attack / defense, świadome uproszczenie modelu IdleLC                                             |

Nie ma uniwersalnego przelicznika flat hit/dodge/critical na punkty procentowe. Oryginał dodaje do ratingów używanych przez serwerowe formuły; `I/src/game/logic/skills.ts:397` i `:400` zawierają własne przeliczniki. DEADLY i CRITICAL są odrębnymi akumulatorami (`S/GameServer/Assist.h:30`, `:38`).

## 4. Czasy, cooldown, zasoby i regeneracja

GameServer kompiluje `__GAME_SERVER__` (`S/GameServer/Makefile:55`), więc ma 10 pulses/s (`S/ShareLib/Config.h:103`). ready/still/fire/reuse oraz durtime są w pulse, czyli 0,1 s. IdleLC poprawnie dzieli eksportowane wartości przez 10 (`I/src/game/logic/skills.ts:163`). Nie każdy efekt ma czas stały: Bless, redukcja debuff time, self/target params, useCount i wyjątki mogą zmieniać duration (`S/GameServer/Assist.cpp:103`, `:145`, `S/GameServer/Skill.cpp:3155`). SF_COMBO pomija odliczanie; SF_INFINITE odtwarza efekt po końcu (`Assist.cpp:356`, `:824`). SF_ABSTIME ma osobne zasady zapisu/limitu, więc nie wolno utożsamiać go z normalnym timerem online.

Cooldown biegnie od READY, nie od trafienia (`S/GameServer/Skill.cpp:803`). Dla PC `IsReady` wymaga NORMAL i liczy bazowe `reuse + m_magicSpeed`, następnie przy `prob=optionDelay+skillCooltime` mnoży przez `150/(150+prob) * 100/(100+prob)`; jeśli wynik <1 pulse, podstawia **10 pulses**, nie 1 (`:665`, `:684`, `:689`, `:705`, `:722`). Dla elementala redukcja jest liniowa (`:708`), APet dzieli reuse przez100 (`:717`). Flagi kompilacji mogą wyłączyć modyfikowanie cooldownu guild/no-cool-state. IdleLC liczy `max(castTime,reuse/10)` oraz liniowy clamp redukcji 50% (`I/src/game/logic/skills.ts:174`, `I/src/game/logic/combat.ts:582`).

`do_SkillFire` porównuje z `readyTime*(100-m_skillSpeed)/100`, ale zbyt wczesny fire **zwiększa hackCount i wysyła wiadomość; ten blok nie robi return** (`S/GameServer/doFuncSkill.cpp:1561`). Zajętość skilla jest czyszczona po ready+still+fire (`S/GameServer/Server.cpp:2420`); wejście w następny skill ma także tolerancję `-15 pulses` (`doFuncSkill.cpp:963`). IdleLC pomija stillTime i dodaje stałe 0,4 s impactDelay, a fire animation lock ma 0 (`I/src/game/logic/combat.ts:37`, `:44`, `:580`). Nie można nazwać tego wierną rekonstrukcją serwerowego timingu.

Koszty HP/MP: źródłami są `a_needHP`, `a_needMP`; nie znaleziono dosłownego symbolu `skillcostMPHP`. READY sprawdza zasoby, FIRE sprawdza je ponownie. W tym snapshotcie wymóg MP to **MP > koszt**, nawet dla kosztu0; HP>koszt, jeśli kosztHP !=0. Koszt MP jest redukowany kolejno przez opcję %, assist %, assist flat i clamp do0 w gałęzi `ASSIST_DECREASE_SKILL_MP` (`S/GameServer/doFuncSkill.cpp:982`, `:1664`). Elemental dzieli MP z właścicielem (`:1661`). Odliczenie następuje przy FIRE (`:1807`), dlatego anulowany READY nie zużywa tu HP/MP. IdleLC sprawdza MP>=koszt i HP>koszt, redukuje MP liniowo maks.75% i odlicza już na początku rzucania (`I/src/game/logic/combat.ts:217`, `:583`, `:865`). Oryginalne koszty GP, przedmiotów i dusz to kolejne niezależne warunki, których obecny model nie zachowuje.

Regeneracja ma dwa mechanizmy:

| Mechanizm                                  | Oryginał                                                                                                                                                                                                                                    | IdleLC                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Naturalny RecoverPC oraz STAT RECOVERHP/MP | Co **3 s**: `S/ShareLib/Config.h:1030`, `S/GameServer/Server.cpp:2431`. W ruchu/combat/cast bazowo HP=1 i MP=1; stojąc 25% bazowej regeneracji, siedząc pełna. Następnie passive i assist flat/rate, opcje; Juno peace ×10 (`PC.cpp:2408`). | Własne % maxHP/MP i skill flat podzielony przez **5 s** (`I/src/game/logic/balance.ts:20`, `:25`; `combat.ts:413`). |
| ASSIST HP/MP i DOT                         | Na sprawdzeniu **1 s**, gate przez `getNowSecond()` (`S/GameServer/Assist.cpp:2793`); heal/DOT przed obniżeniem remain o10 (`:626`, `:721`).                                                                                                | HP/MP płynnie `rate*dt`; poison osobno co1s (`I/src/game/logic/combat.ts:405`, `:442`).                             |

ASSIST HP/MP z damageType2 odnosi moc do maksymalnego zasobu; pozostałe typy dodają flat. HP ma minimum1 i maksimum maxHP; MP minimum0 i maksimum maxMP (`S/GameServer/Assist.cpp:626`). To nie to samo co stat RECOVERHP/MP. Pierwszy heal okresowy nie jest jawnie wykonywany przez `ApplyMagic`; stan zostaje dodany, a zasób rośnie przy następnym `DecreaseTime` — tick jest związany z zegarem sprawdzania, nie zawsze dokładnie 1 s od wypicia.

## 5. Stun, poison, silence, stone, cleanse, resurrection, summon

**Stun** to ASSIST7; ustawia AST_STURN, blokuje move/attack/spell (`S/GameServer/Assist.cpp:1881`, `S/GameServer/Character.cpp:326`). **Confusion** ASSIST2 ustawia AST_CONFUSION, którego te trzy predykaty nie traktują jak stunu (`Assist.cpp:1852`); nie należy mylić go z ASSIST33 CONFUSED, obsługującym specjalną flagę AI NPC (`Skill.cpp:1589`). **BLOOD** ASSIST5 jest DOT obok poison, disease, curse i HP_DOT (`Assist.cpp:405`). W IdleLC ASSIST2,5,7 są stunem, a jedynym DOT jest0; Body Crasher staje się przez to stunem zamiast krwawienia.

**Silence** ASSIST4 blokuje `CanSpell`, pozostawiając `CanMove` i `CanAttack` (`S/GameServer/Character.cpp:368`). **Stone** ASSIST3 blokuje wszystkie trzy; dodatkowo aplikacja stone czyści istniejące assisty z wyjątkami (`S/GameServer/Assist.cpp:2564`, `:2829`). Raid/boss immunity może wynikać z `RAID_MONSTER_SKIP_STONE/STURN` albo z NPC state flags i skilla1751 rosnącego po kolejnych kontrolach (`Assist.cpp:1856`, `:1882`, `:2522`). Hitrate ma także modyfikację odporności stone/stun/silent i narastającą odporność NPC (`Battle_GetDamage.cpp:348`). IdleLC nie ma osobnych silence/stone/hold/sleep ani tych odporności; stun dodatkowo kasuje bieżący cast/swing (`combat.ts:727`). Oryginalny `CanSpell` kontroluje rozpoczęcie READY; nie należy dopisywać automatycznego przerwania każdego trwającego READY bez dalszego dowodu.

**Poison/Blood/Disease/Curse/HP_DOT:** na NPC flat power jest flat tick damage, rate to maxHP*power/100. Na PC kod redukuje flat do `power/20`, a w rate ma dosłownie `maxHP*(power/100/20)` z dzieleniem całkowitoliczbowym (`S/GameServer/Assist.cpp:406`, `:422`, `:459`). Nie należy „poprawiać” tej ostatniej kolejności według komentarza. Standardowy DOT nie zabija: HP po odjęciu jest przywracane do1; wyjątek Royal Rumble ma osobną ścieżkę śmierci (`:493`, minimumHP w `:563`). IdleLC poison może zabić (`I/src/game/logic/combat.ts:538`).

**Cleanse:** `MT_CURE` wywołuje `CureAssist(assistSubtype, magicLevel)` (`S/GameServer/Skill.cpp:2024`). Usuwany jest cały wpis assist, jeśli zawiera wskazany magic i jego level <= cure level, a nie określona liczba HP równa power (`S/GameServer/Assist.cpp:3189`, `:3211`). CURE10 i14 oba wywołują `ClearAssist(true,false,false,true,false)`, czyli curse, respektując NOCANCEL (`Skill.cpp:2204`, `Assist.cpp:2217`). IdleLC interpretuje całe type5 jako null; Cure Poison i zależna Resurrection są niedostępne (`I/src/game/logic/skills.ts:110`, `:188`).

**Resurrection:** CURE6 działa na DEAD; HP=50% max, MP co najmniej50% max, wysłanie rebirth; `power` przy RATE odzyskuje odpowiedni procent straconego EXP, nie HP (`S/GameServer/Skill.cpp:2062`, `:2131`, `:2152`). Są dodatkowe warunki oblężenia i chaotic. ASSIST38 REBIRTH to inna stała i inny rodzaj efektu; nie zastępuje CURE6. IdleLC po porażce odradza bohatera własnym mechanizmem, a oryginalnego skilla nie obsługuje.

**Summon:** OTHER9 dla PC wywołuje `SummonElemental(rawPower)` — power jest identyfikatorem rodzaju elementala, nie siłą/obrażeniami; dla NPC używa aileader idx/count i tworzy NPC (`S/GameServer/Skill.cpp:2331`). Osobna rodzina ST_SUMMON_SKILL9 korzysta z summonIdx i tworzy totem/trap/owned NPC (`Skill.cpp:2835`, `:2919`, `:2932`); ASSIST44/45/46/53/54 współpracują z tą ścieżką. Obecne type6→null i `isAvailable` odcinają summony oraz zależne skille (`I/src/game/logic/skills.ts:110`, `:188`). Bez danych prototypu elementala/NPC nie da się podać jego statystyk z samego power.

## 6. Nakładanie buffów i wymagania

Nie wystarcza `skillId` jako klucz duplikatu. `CAssistList::CanApply` porównuje **magic index** i magic level: niższy level nie nadpisze wyższego (`S/GameServer/Assist.cpp:180`). `DelDuplicate` usuwa poprzedni wpis skill zawierający ten sam magic, gdy nowy magic level >= stary (`:232`); działa przez help i curse (`:2690`). Są wyjątki po ID (m.in.1756/1757), eventach, specjalne wzajemne wykluczenia, jedna aura naraz (`:2670`) oraz SF_NOTDUPLICATE zabraniające ponownego użycia tego samego skilla (`S/GameServer/Skill.cpp:2651`). Limity wynoszą30 help,8 curse,40 ABS (`S/ShareLib/Config.h:331`). NOCANCEL, COMBO, ABS, INFINITE i useCount zmieniają usuwanie/żywotność.

IdleLC nadpisuje tylko efekty o tym samym skillId i blokuje automatyczny buff/debuff, gdy aktywny (`I/src/game/logic/combat.ts:714`, `:871`). Dwa różne skille z tym samym magic będą mogły nieprawidłowo współistnieć. Efekty jednego skilla są rozpoznawane i nakładane zbiorczo, podczas gdy LC pamięta trafienie osobno dla każdego magic. Heurystyka offensive (damage/stun/poison lub wyłącznie ujemne staty i targetType2) nie zastępuje SF_HELP/SF_NOTHELP. Przykład `Veteran's Composure` targetType3/taunt może być uznany za buff na siebie przez brak obsługi OTHER8 (`I/src/game/logic/skills.ts:148`), mimo ujemnych statów na wrogu.

Wymagania użycia `SCT_*`: DEATH1, WEAPON2, SITDOWN4, PEACEZONE8, SHIELD16, STAND32, DARKNESS64, NO_COOL_TIME128 (`S/GameServer/Skill.h:324`). `CheckUseState` sprawdza broń i dozwolone subtypy **tylko gdy WEAPON jest ustawione**, tarczę, sit/stand, zakaz peace, darkness i wymagane assisty (`S/GameServer/Skill.cpp:418`). `CanApplySkill` osobno sprawdza stan celu, w tym DEAD, app weapons, sit/stand, shield i app magic (`S/GameServer/Character.cpp:249`). Nie wolno traktować useState i appState jako jednego zestawu.

IdleLC zachowuje tylko WEAPON/SHIELD i listy weapon subtype (`I/scripts/lc/import-db.mjs:666`, `I/src/game/logic/skills.ts:356`). Dodatkowo egzekwuje `needs.weapons` dla każdej noszonej broni **nawet gdy weapon=false**; oryginał wówczas nie sprawdza subtypu. Dotyczy np. Shield Strike (id46), gdzie tarcza jest wymagana, ale bit WEAPON nie. Passive wykorzystują app needs, co jest właściwym rozdzieleniem, ale uproszczenie flag pozostaje. Eksport pomija pełne state, required magic, stat/item/soul requirements, zasięgi i target count.

## 7. Przykłady odczytane z aktualnego lc-data.json

Źródło wszystkich poniższych rekordów: `I/src/game/data/generated/lc-data.json:1` (plik jest jednoliniowy, 119 skills; podano ID i magic, aby można było odtworzyć selekcję). Wartości z pierwszego poziomu. Interpretacja LC jest **warunkowa względem tej kombinacji danych**, z dowodem wykonania powyżej.

| Skill / rekord                       | Aktualne wartości                                                                      | Wniosek z oryginalnego kodu i różnica IdleLC                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Power Magnum; magic1403            | MP8, ready0, fire22, reuse30; ATTACK0/ADDITION, power150                               | Fire2,2 s, reuse bazowo3 s;150 to składnik addytywny. IdleLC mnożnik2,5× normal hit.                                                     |
| 43 Body Crasher; magic63+1405        | MP26, duration100=10 s, fire41, reuse80; attack addition500 + ASSIST BLOOD5 addition20 | Drugi efekt: krwawienie20 HP/tick na NPC; nie stun20%. IdleLC robi stun20% i nie zadaje tych DOT.                                        |
| 46 Shield Strike; magic83            | MP30, duration40=4 s, fire28, reuse250; ASSIST STURN7 power0                           | Stun4 s, szansa nieznana bez a_hitrate/hittype; IdleLC gwarantuje stun po wspólnym trafieniu.                                            |
| 129 Confusion; magic166              | MP6, duration50=5 s, reuse50; ASSIST2 power0                                           | Stan confusion5 s; IdleLC stun5 s. Nie ma podstawy do utożsamienia z pełną blokadą akcji.                                                |
| 123 Poison Capsule; magic172         | MP21, duration250=25 s, reuse100; ASSIST POISON0/ONLYPOWER power6                      | Na NPC tick6 co1 s, standardowo do minimum1HP; IdleLC ta sama surowa skala obrażeń, ale może zabić.                                      |
| 57 Amplication; magic113             | Passive; STAT22/RATE power6                                                            | +6% maxHP z ograniczeniem premii rate do450HP. IdleLC +6% attack. Nazwa skilla nie rozstrzyga semantyki.                                 |
| 225 Haste; magic253                  | MP60, ready14=1,4 s, reuse36=3,6 s, duration3000=300 s; STAT23/RATE10                  | Ready time kolejnych castów ×0,90; IdleLC przyspiesza podstawowe ataki.                                                                  |
| 66 Fast Spell Casting; magic123      | Passive; STAT8/ADDITION -2                                                             | m_magicSpeed -2 pulse, czyli bazowy reuse -0,2 s, z wyjątkami cooldown flags; IdleLC skraca cast o0,2 s.                                 |
| 24 Deep Wound Training; magic77      | Passive STAT14/ADDITION20                                                              | +20 do deadly rating; IdleLC +0,20 crit damage multiplier.                                                                               |
| 38 Rise Mana; magic91                | Passive STAT11/ADDITION2                                                               | +2 MP na naturalny tick3 s przed kolejnymi modyfikatorami; IdleLC +2/5 MP/s.                                                             |
| 224 Mana Recovery; magic1429         | MP120, ready14, duration3000; ASSIST MP10/ADDITION2                                    | +2 MP na tick1 s; to inna rodzina niż Rise Mana. Aktualny flat power odczyt zgodny co do średniej.                                       |
| 42 Tyrant; magic60/61/62             | MP1, duration1800=180 s; attack+10, defense+20, ASSIST MP_CANCEL13 power-1             | Trzeci efekt zużywa1MP/tick i kończy cały assist przy wyjściu MP poza granice. IdleLC ten koszt podtrzymania ignoruje.                   |
| 60 Transformation; magic116          | HP40, MP0; RECOVER MP1/ONLYPOWER100                                                    | Koszt40HP za100MP; nie +100%. W oryginale MP musi być >0 z powodu dosłownego testu kosztuMP.                                             |
| 39 Cure Poison; magic98              | MP27, ready15, fire15, reuse40; CURE0 power0                                           | Cure używa magicLevel do usuwania poison; power0 nie oznacza braku działania. IdleLC null.                                               |
| 50 Resurrection; magic102            | MP600, ready15, fire10, reuse600; CURE6/RATE30                                         | Przywraca50%HP, >=50%MP i30% utraconegoEXP z warunkami; power30 nie oznacza30%HP. IdleLC unavailable.                                    |
| 293 Summon Earth Elemental; magic294 | MP80, fire24, reuse50; OTHER SUMMON9 power2                                            | `SummonElemental(2)`;2 to selector, nie moc2. Pozostałe eksportowane summony mają selectors0/3/1.                                        |
| item43 Small Healing Potion          | power16, duration15 s, cooldown5 s                                                     | Przy flat ASSIST HP odpowiada16/tick1 s; nominalnie240HP przez15 ticków, ale faza zegara/cap/refresh zmienia realny efekt.               |
| item490 Small HP Recovery Potion     | power2, duration600 s, cooldown5 s                                                     | Premia naturalnej regeneracji +2/tick3 s; IdleLC +2/tick5 s. Eksport potions nie zachowuje damageType ani poziomu wskazanego przez item. |

## 8. Braki danych, wariant kompilacji i kolejność przyszłych prac

Fakty wykonania są potwierdzone w źródłach. Nie potwierdzono zgodności eksportowanej bazy z tym konkretnym buildem ani efektywnego zestawu preprocesora wydanego serwera. `Makefile:57` ma domyślnie KOR, ale zawiera cele regionalne; `S/ShareLib/Config_Localize.h:8` dobiera nagłówki. `ASSIST_DECREASE_TIME_BUG_FIX` jest np. w KOR/TLD, `ASSIST_DECREASE_SKILL_MP`, `SKILL_TYPE_NO_COOL_TIME`, `BUGFIX_GUILD_SKILL_COOLTIME` są m.in. w gamigo (`Config_Localize_gamigo.h:271`, `:306`), a raid-skip i JPN crit to odrębne warunki. Nie wnioskowano działającej konfiguracji z obecności pojedynczego `#ifdef`.

Bieżący `buildSkills` zachowuje z magic tylko index/type/subtype/damageType/power (`I/scripts/lc/import-db.mjs:700`), gubi **magicLevel, a_hitrate, a_hittype, attribute, psp/ptp/hsp/htp, toggle**, a ze skilla **flag, stillTime, pełne use/appState, use/appMagic, range/count, soul, koszty item/GP**. `buildPotions` bierze level1 i pierwszy magic, gubi damageType i operuje bez serwerowej tożsamości efektu (`:467`). Odczyt brakującego rekordu power jako0 (`:705`) zaciera różnicę „legalne zero” / „brak danych”. `CURE` i stack potrzebują magicLevel, którego nie można odzyskać z samego power. To braki eksportu, a nie nierozstrzygnięte enumy.

Rekomendowana kolejność implementacji po osobnym zleceniu:

1. Zdefiniować jawne enumy i zachować surowe dane potrzebne do dispatchu; brak danych pozostawić jako brak, bez podszywania się pod legalne zero. Dodać provenance/version źródła bazy i wybrany wariant build.
2. Naprawić bezdyskusyjne pomyłki STAT14/22/23, ASSIST2/5/7 i damageType. Rozdzielić MAGICSPD od SKILLSPD, recover-stat od assist-regen, deadly od crit multiplier, silencing od pełnego stunu.
3. Wybrać jawnie zakres zgodności IdleLC: własne obrażenia i tempo auto-combatu albo emulacja ścieżki LC z osobnymi trafieniami, zaokrągleniami i cooldown formula. Tych modeli nie należy mieszać pod opisem „1:1”.
4. Wdrożyć key magicIndex+magicLevel dla konfliktów/cleanse, maskę trafień, flagi HELP/NOTHELP/NOCANCEL/NOTDUPLICATE i właściwe use/app requirements. Dopiero później rozszerzać summon/party/death target.
5. Weryfikować na reprezentatywnych rekordach powyżej; testować granice MP==cost, cancel READY, DOT przy1HP, procentowy heal, dwa różne skille z tym samym magic, regenerację3 s kontra1 s i cap450HP. W audycie nie tworzono testów ani zmian aplikacji.

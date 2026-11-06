# Walka z serwera, brakujące skille i żywiołaki — 2026-11-06

Claude Code, punkt wyjścia `445f599`. SaveVersion nadal **14** (bez nowych pól zapisu: stan walki,
żywiołaki i nienawiść potwora żyją tylko w sesji walki).

| Commit    | Zakres                                                                                     |
| --------- | ------------------------------------------------------------------------------------------ |
| `1cc02e0` | szybkie poprawki: poświata slotów mikstur, Equipment, 100 Cooldown, wycofana 90001, Remove |
| `6555b24` | ciosy i tempo ataku potworów jak `GetDamage` (gałąź NPC) i AI serwera                      |
| `bfe732d` | kara za śmierć (EXP/SP) w walce i na wyprawie                                              |
| `9708ca3` | koszt many/HP skilla płacony w chwili wystrzału (FIRE), MP musi być większe od kosztu      |
| `87cfbbf` | żywioły: tabela `nAttrTbl`, poziomy żywiołów, opcje 87–98, Book pokazuje żywioły potworów  |
| `d2ad688` | Far Seeing, Combat Reflection, Charge, Veteran's Composure; powody w oknie Skills          |
| `dd3564a` | żywiołaki Sorcerera w logice walki, nienawiść potwora, prowokacja, pasywne „Empowered”     |
| `576f8c0` | żywiołaki w scenie: modele klienta, ruch, animacje, pasek HP                               |
| `perf`    | teren czyta tylko widoczne warstwy, Settings → Performance info                            |

## Szybkie poprawki (zgłoszenie z 2026-11-05 wieczór)

- Sloty HP/MP: bez pulsującej złotej poświaty, zwykła złota ramka przy AUTO.
- Character → Equipment: nagłówek, plansza w ramce i lista „Worn” (wiersz otwiera okno przedmiotu).
- **100 Cooldown Reduction Potion (6916)** = skille gotowe od razu (własna reguła właściciela:
  `noCooldown` → `cooldownFree`; poza stałymi cooldownami `SF_GUILD`/`SCT_NO_COOL_TIME`).
- Własna 100% Cast Potion (90001) **wycofana**; zapis zwraca 50 000 złota za każdą sztukę
  (`WITHDRAWN_ITEMS` w `save.ts`).
- Remove effect pyta o potwierdzenie i pokazuje na czerwono, które statystyki spadły.
- „If you wear it” ma szerokość pól i przycisków nad/pod nim.

## Mechanika walki z serwera

- **Ciosy potworów** (`npcDamage`, `balance.ts`): STR/DEX/INT × 10 / 15 + atak według typu ciosu
  − obrona bohatera / 3,5 (magia: − cały resist); obrona = sprzęt i opcje + 3 × poziom (resist:
  poziom / 2), osłabione, gdy zbroja jest dużo powyżej poziomu (`defenseLevelPenalty`). Tempo:
  `trunc(a_attackSpeed × 15 / 10) / 10` s.
- **Kara za śmierć** (`death.ts`): 0 / 5 / 3 / 2% liczone jak na serwerze, odejmowane od EXP i SP
  przy każdej śmierci w walce i na wyprawie; podsumowanie wyprawy pokazuje „Lost on death”.
- **Koszt skilla przy wystrzale** (`doFuncSkill.cpp`): cooldown od startu, MP/HP dopiero, gdy skill
  wychodzi; ogłuszony bohater nic nie płaci.
- **Żywioły** (`elementDamage`): tabela `nAttrTbl`, stosunek poziomów, minimum 1; nie dla
  `MDT_ONLYPOWER`. 86 potworów z bazy ma żywioły. Bohater nie ma jeszcze źródła żywiołu (opcje 87–98
  nie wypadają, skille żywiołów są tylko u podklas).
- Premia „stronger” z pasywnych (`MST_STAT_STRONG`) nie ma skilla w sześciu klasach bazowych.

## Brakujące skille

- **Far Seeing** (Rogue, kusza): `MST_STAT_ATTACKDIST`, metry +1…+5 do zasięgu (`attackRange`).
- **Combat Reflection** (Rogue): szansa 5–25% (hitrate) na odbicie 4–20% przyjętego ciosu po jego
  przeżyciu (`Battle.cpp:185–204`); odbicie może zabić potwora.
- **Charge** (Titan): `MST_OTHER_SKILLCANCEL` przerywa przygotowywany skill potwora (szansa 40–80%).
  Własna reguła AUTO: używany tylko, gdy potwór przygotowuje skill (w bazie 3 z 64 skilli NPC mają
  czas przygotowania).
- **Veteran's Composure** (poziom 100): osłabia obronę i tempo ataku potwora; nigdy na bossie
  (`SF_NOT_BOSS`). Prowokacja przyciąga potwora z powrotem od żywiołaka.
- **Resurrection** i **Invisibility** zostają niedostępne: wskrzeszenie dotyczy martwego członka
  drużyny, a niewidzialność znika przy pierwszym ataku. Okno Skills mówi to wprost.

## Żywiołaki Sorcerera

Źródła: `Elemental.cpp`, `PC.cpp` (`SummonElemental`, `UnsummonElemental`, `CanSummonElemental`),
`Config.h` (`ELEMENTAL_*`, `SUMMON_*`), `Battle.cpp` (`ApplyHateByDamage`, wybór celu), klient
`SlaveInfo.cpp` (modele i klipy), `skills.lod` klienta 2015 (pole `a_sorcerer`, którego brak w zrzucie
2016).

- Statystyki w chwili przywołania (`elementalStats`, `summons.ts`): HP 50/30/50/30 + 5 × (STR − 20)
  - 5 × (CON − 28) przywołującego; magia broni i opcji × 0,8 / 1,1 / 1,2 / 0,88; obrona zbroi i opcji
    × 1,5 / 1,4 / 1,2 / 1,4; resist = poziom; trafienie i unik bohatera; atak magiczny co 2 s;
    zasięg 2 / 7 / 3 / 7 m.
- 20 minut, potem odchodzi; po zniknięciu lub śmierci 5 s przerwy dla tego rodzaju. Ogień i wiatr
  nigdy razem z ziemią lub wodą. Śmierć bohatera odsyła wszystkie.
- **Nienawiść potwora**: 10 000 × obrażenia / max HP potwora (min. 1), +1500 za pierwszy cios;
  potwór bije tego, kogo nienawidzi najbardziej (remis: bohater). Prowokacja (`MST_OTHER_TOUNT`)
  zamienia nienawiść jak na serwerze.
- **Pasywne**: „Empowered … Elemental” działają tylko na swojego żywiołaka (nie na bohatera),
  Defense shield na bohatera i wszystkie żywiołaki (bity `SSF_APP_*` z `skills.lod`).
- Modele `summonfire/wind/land/water` z `Data\NPC\Summon` (`scripts/lc/summons.mjs`,
  `convert-lc --only summonfire,summonwind,summonland,summonwater`).

**Własne uproszczenia** (rejestr decyzji): ciosy żywiołaka prowadzi klient, więc IdleLC wykonuje je
co `ELEMENTAL_ATTACK_SPEED` w potwora bohatera; żywiołak dobiega razem z bohaterem (bez osobnej
symulacji ruchu); skill potwora wymierzony w żywiołaka zadaje tylko obrażenia; brak `a_hate` skilli
w zrzucie, więc nienawiść rośnie tylko od obrażeń; AUTO przywołuje pierwszy dostępny rodzaj.

## Wydajność na telefonie

- Pomiar w Chromium (390×844, profil CPU, także z CPU ×4): główny wątek jest bezczynny ok. 90%
  czasu w walce i w biegu po mapie; JS gry (logika, `MapProps`, HUD) nie jest wąskim gardłem.
  Obciążenie telefonu to GPU, głównie piksele terenu. Prawdziwego FPS na iPhonie stąd nie da się
  zmierzyć (Chromium rysuje programowo przez swiftshader).
- **Teren**: shader sumuje udział każdej warstwy (maska × to, co zostawiają warstwy wyżej) i czyta
  teksturę warstwy tylko tam, gdzie udział > 0 (`terrainShader.ts`, `textureGrad`, te same mipmapy
  i filtrowanie). Wynik taki sam jak dawny łańcuch `mix` (test równoważności); zwykle czytane są
  2–3 z 7–12 warstw. Swiftshader: ok. 10% szybsze klatki na Juno.
- **Settings → Performance info** (pamiętane w przeglądarce, nie w zapisie): FPS, najwolniejsza
  klatka, wywołania rysowania, trójkąty i DPR, do odczytu na telefonie. Na Juno: ok. 45–90 wywołań
  i 56 tys. trójkątów.

## Następny etap: efekty skilli z plików klienta

`scripts/lc/skill-effects.mjs` odczytuje dla 75 skilli nazwy efektów z `skills.lod` i animacji
`.bae`; 70 grup `Effect.dat` daje się odczytać, 187 odpada w całości przez jeden nieobsługiwany
element (dźwięk `EFSN`, światło `EFLT`, `EFOB`, `EFSB`). Plan: (1) pomijać dźwięki i światła
w grupach zamiast odrzucać całą grupę, (2) wspólny odtwarzacz grup z czasem życia i punktami
`_TAG_*` (cząstki z `TitleAura`, modele i ślady z `UpgradeAura`), (3) skille po kolei z porównaniem
z klientem przez właściciela, z obecnymi efektami jako zapasem.

## Weryfikacja

`npm run check` — **493 testy / 56 plików** (nowe: `classSkills.test.ts`, `summons.test.ts`, testy
`npcDamage`, `death.test.ts`, `canPaySkill`, `elementDamage`). Próba na prawdziwych danych: Sorcerer
30 z żywiołakiem przeciw Elder Drake w 10 min: 5 → 14 (ogień) / 20 (ziemia z Empowered) zabójstw.
Chromium 390×844: żywiołak ognia przy jeleniu w Juno, pasek HP, bez błędów konsoli.

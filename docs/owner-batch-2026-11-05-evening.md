# 15 zgłoszeń właściciela — wieczór 2026-11-05

Claude Code, punkt wyjścia `b1bbc0e`. SaveVersion nadal **14** (bez nowych pól zapisu).

| Commit    | Zakres                                                                              |
| --------- | ----------------------------------------------------------------------------------- |
| `4069ec7` | Super Haste Potion, własna 100% Cast Potion, Adrenalina we wszystkich sklepach      |
| `d6a791a` | opcje tytułów i opcje specjalne 1:1 z serwerem, typy ciosów potworów                |
| `abf96ad` | licznik biegu, blokada wyprawy w biegu, nowa mapa od pierwszego spotu               |
| `baffd2a` | porównanie sprzętu, opis mikstur, Remove effect, Settings, slot mikstury, Equipment |
| `c446eb9` | czyste maski warstw terenu na wszystkich mapach                                     |
| `2ebf847` | efekty ulepszeń i tytułu na ekranie wyboru postaci                                  |
| `76cf06f` | dym pod stopami przy wzmocnieniu biegu                                              |

## Punkt 3: tytuły i mikstury „1:1 z plikami serwera”

Źródło: `Character.cpp CPC::ApplyTitle`, `Option.cpp ApplyOptionValue`, `PC.cpp RecoverPC`,
`Battle_GetDamage.cpp SelectHitType_Adult`, `Assist.cpp CAssistList::Add`, klient
`Util_Help.cpp GetPaciveOptionType` (sposób wyświetlania).

- **Crit Rate tytułu „The one who cut the shadow of darkness” jest poprawny**: opcja 55 poziomu 10
  ma wartość 150 i serwer liczy `critical += critical × 150 / 100` (CmdMsg.cpp:837), więc 342 → 855.
  Błędny był tylko opis: gra pisała „+15%”, klient pisze „150%”. Teraz 55 i 66 pokazują „+150%”.
- **24/25** to w Config.h `OPTION_NOT_USED_24/25`: ani sprzęt, ani tytuł ich nie czyta. Dotąd
  działały jak kradzież MP/HP (D16) — usunięte, opis „Unused by the game”.
- **Tytuł, opcja 50** zapisuje `m_opIncreaseInven`, którego serwer nigdzie nie czyta: brak efektu
  (na sprzęcie 50 nadal daje stałą regenerację HP po procentach).
- **Tytuł, opcja 99 (All Stats)** dodaje tylko `m_opStr…m_opCon`: liczba jest widoczna w oknie
  Character, ale siła/HP/walka się nie zmieniają (`CombatStats.shownAttributeBonus`). Na sprzęcie
  99 działa w pełni.
- **101** skraca efekty z flagą dokładnie `SF_NOTHELP` nałożone na bohatera o `v/10000`
  (`SkillRank.reducibleDebuff`, `combat.ts applyEffects`); opis jak w kliencie „+0.30%”.
- **102/103** stała regeneracja HP/MP po procentach (`recoveryOptions.hpFlat/mpFlat`).
- **104 (Toughness)** dodaje się do wytrzymałości broniącego w wagach słabego/normalnego ciosu.
  Dlatego ciosy potworów używają teraz źródłowych typów: baza NPC 38 STR / 28 DEX / 28 INT,
  krytyczny i śmiertelny tylko u bossów i pół-bossów (`NPC_BOSS|NPC_MBOSS`, `MonsterDef.stats.boss`),
  zamiast własnych 5% × 1,5. Bierna premia „stronger” skilli jeszcze nie istnieje w IdleLC.
- **105** dodaje się do wagi ciężkiego ciosu (`hardBonus`), **106** do maksymalnego HP.
- **100** (PvP) i **85/86** (zwierzaki) nie mają odpowiednika w grze.
- Mikstury: wartości HP/MP i wzmocnień były już z bazy; Super Haste (2845) z bazy: Run speed
  +5,0 m/s na godzinę, NOCANCEL/ABSTIME/NOTDUPLICATE.

## Pozostałe punkty

1. **Licznik biegu**: „Moving to another spot” + czas do końca przy obecnym Run speed
   (`travelSecondsLeft`), z uwzględnieniem dev time scale.
2. **Ekran wyboru**: podgląd ma efekty ulepszeń broni/zbroi i efekt założonego tytułu.
3. Jak wyżej.
4. **Equipment**: plansza klasy na niebieskiej „scenie”, która wypełnia zakładkę; krawędzie
   tekstury przechodzą w tło (maska CSS), bez prostokąta na szarym.
5. **Wyprawa w biegu**: przycisk Expedition i Send zablokowane podczas biegu; gdyby wyprawa jednak
   ruszyła w biegu, zaczyna się na spocie, z którego bohater wybiegł (`runFrom` w `gameStore`).
   Wybór innej mapy zawsze prowadzi na jej **pierwszy** spot (skok za ekranem ładowania).
6. **If you wear it**: każda zmieniona statystyka okna Character w osobnym wierszu (zielone lepsze,
   czerwone gorsze), Wear na całą szerokość pod spodem (Inventory i Shop, `WearCompare.tsx`).
7. **Kreski i kwadraty na ziemi**: maski warstw terenu były zepsute na wszystkich mapach — sharp
   zwraca 3 kanały po skalowaniu jednokanałowej maski (wiersze się przesuwały), a bezstratny WebP
   nadpisywał kolor pod przezroczystymi pikselami czwartej maski. Poprawka w `terrain.mjs`
   (`scaleMask`, `exact: true`), nowy tryb `--only masks` przepisał tylko `masks-<n>.webp`
   (areny i obiekty bez zmian), `MAP_REVISION = '2026-11-05-masks'`, maski i warstwy z `?v=`.
8. **100% Cast Potion**: własny przedmiot 90001 (w bazie brak mikstury STAT23): szybkość rzucania
   skilli +100% = brak czasu przygotowania (`readyTime × (100 − 100) / 100`), 1 h, jak mikstury
   cash (NOCANCEL, ABSTIME, NOTDUPLICATE), ikona t_item 1315, cena własna 50 000.
9. **Okno mikstury**: każdy efekt w osobnym wierszu, „Lasts”, a pod spodem jedna uwaga na linię.
10. **Adrenalina** jest w każdym sklepie (dotąd tylko Juno z `t_shopitem`).
11. **Remove effect** w oknie efektu bohatera — dla buffów i mikstur; klątwy, ogłuszenia, trucizny
    zostają. Zdjęta mikstura-wzmocnienie znika też z zapisu.
12. **Settings**: jedna linia oddzielająca na grupę zamiast pod każdą opcją.
13. **Slot mikstury**: bez „Empty the slot”, tylko pole AUTO.
14. **Super Haste Potion** (t_item 2845) we wszystkich sklepach, cena własna 50 000.
15. **Dym pod stopami**: efekt klienta `EST_ASSIST_MOVESPD` → „DK Normal State” → cząsteczki
    `dkBottomFog'` z Effect.dat (30/s, życie 0,7–0,8 s, pierścień 0,5–1,7 m, ×0,7→×1,4, alfa 80,
    kolor 171A2B…171717, tekstura `pef_20` → `public/fx/run-smoke.webp`), `RunSmoke.tsx`.

## Weryfikacja

`npm run check` — **464 testy / 53 pliki** (nowe: `titleOptions.test.ts`, testy `removeEffect`,
`travelSecondsLeft`, `scaleMask`). Chromium 390×844: bieg Egeha bez kresek, licznik biegu
i zablokowana wyprawa, porównanie Wear, okno mikstury, Remove effect (zapis `boosts: []`),
Settings, slot mikstury, Equipment, ekran wyboru z wróżką ulepszenia, dym po Super Haste.

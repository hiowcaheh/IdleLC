# Partia właściciela 2026-11-06 (Claude Code): 12 zgłoszeń

Commity `de2f4fe` … `a461e58` na `main`. SaveVersion bez zmian: **16** (nowe pole
`PotionSlot.below` jest opcjonalne, stare zapisy działają bez migracji).
Weryfikacja: `npm run check` 543 testy / 61 plików, build, próby Chromium 390 × 844
i 1100 × 760 (HUD, suwak AUTO, picie z torby, przewijane buffy, okno Dungeons, wynik
rundy, wejście do Belfist Temple). Brak błędów JS/konsoli.

## Co zrobiono

1. **Dungeons Codexa zachowane.** Wszystkie zmiany w jego plikach są opisane niżej
   („Dla Codexa”). Logika rund, punktów, Buffera i zapisu v16 nie była ruszana.
2. **Wyprawy liczą aktywne mikstury i buffy.** `simulateAfk` już odliczał ich czas;
   teraz także raportuje je w podsumowaniu (`boosts`, wiersz „Boosts” w oknie powrotu).
   Prognoza w oknie wyprawy (`estimateHourly`) dzieli pierwszą godzinę na odcinki według
   końców boostów i mierzy każdy odcinek z tym, co jeszcze działa, więc zabójstwa, EXP,
   złoto i drop rosną realnie tylko na czas działania. Nagłówek „Expected in the first
   hour” i lista „Boosts on the expedition”.
3. **Super Haste blokuje Potion of Haste** jak w kliencie/serwerze (`CAssistList::CanApply`):
   nowy efekt jest odrzucany, gdy działa ten sam `magic` na wyższym poziomie
   (`strongerWorking`); słabszy efekt tego samego `magic` jest zastępowany
   (`DelDuplicate`). Komunikat „A stronger effect of this kind is working.”
4. **Łupy i EXP po zabiciu** wychodzą po lewej stronie (`.reward-feed`).
5. **Sloty mikstur AUTO** są po prawej, tuż nad paskiem skilli (także w Dungeons),
   zamiast na środku lewej krawędzi.
6. **Suwak progu AUTO.** Pod przełącznikiem AUTO w oknie slotu: „Drinks it below N% HP/MP”,
   5–100% co 5%. 100% = pij, gdy pasek nie jest pełny. Zapis po puszczeniu suwaka
   (`setPotionSlot`), działa w walce, Dungeons i na wyprawach (`potionSupply` → `below`).
   Bez ustawienia zostają dotychczasowe progi: leczenie 50% HP, mana 30% MP, regeneracja
   „gdy niepełny” (**własne**, jak wcześniej).
7. **Okno znika po wypiciu**: karta przedmiotu w Inventory oraz torba łupów w Dungeons
   zamykają się po udanym wypiciu (błąd zostawia okno i pokazuje komunikat).
8. **Book bez żywiołów**: usunięte wiersze Attack element / Defense element.
9. **Przycisk Dungeons**: zamiast cyjanowego Q z radaru w okrągłej plakietce jest znak
   podziemi z mapy świata klienta (`UIMap.cpp m_rtSubZone[DUNGEON]`, `Map.tex` 67,91 32×36)
   w ramce przycisku szybkiego menu (`UIPlayerInfo.cpp m_btnQuickMenu`, TopUI 22×22),
   tak jak Character / Inventory / System.
10. **Buffy w jednej linii** (także w Dungeons), przewijane w bok, maks. **50** naraz.
    Strona z ukrytymi buffami wygasa, a strzałka klienta (`page-left/right` z Quest.tex)
    pokazuje kierunek i po dotknięciu przewija.
11. **Maks. 20 m/s biegu bohatera** (`MAX_RUN_SPEED`) bez względu na mikstury, buffy
    i opcje: jedno miejsce `runSpeed()` obsługuje walkę, bieg między spotami, wyprawy
    i ruch w Dungeons. Character i wyskakujące zmiany statystyk pokazują prędkość po limicie.
    Potwory zachowują prędkość z bazy.
12. **GUI Dungeons** (tylko wygląd): grafika podziemia jest wyborem (nazwa na grafice
    w kolorze podziemia, strzałki po bokach, kropka na każde podziemie, plakietka poziomu
    przy blokadzie), fakty w stylu wierszy Book, zasady jako krótka lista, ranking z miejscami,
    „Enter dungeon” zawsze widoczny na dole okna, punkty w jednym wąskim wierszu, dwie kolumny
    od 760 px. Okno wyniku: tablica z wynikiem na grafice podziemia, kolor wyniku zależny od
    zakończenia, fakty w wierszach, łupy w slotach torby, kara za śmierć w czerwonej ramce.

## Dla Codexa: co zmieniłem w Twoich plikach

Cześć! Twoje Dungeons działają świetnie, dziękuję. Zmieniałem tylko wygląd i kilka
wspólnych miejsc, bez ruszania reguł rundy, punktów, Buffera i zapisu:

- `src/ui/dungeons/Dungeons.tsx`
  - `DungeonsPanel`: `.dungeon-carousel` + `.dungeon-preview` zastąpiłem jednym
    `.dungeon-hero` (grafika, strzałki `.dungeon-hero__arrow`, podpis, `.dungeon-hero__lock`)
    i `.dungeon-pager` (kropki).
  - Fakty to teraz `<dl className="dungeon-facts">`; „Best score in one run” przeszło
    z rankingu do faktów.
  - Zasady to lista `<ul>` w `.dungeon-rules` z tymi samymi zdaniami. Ranking ma
    numerowane miejsca i `.is-you`.
  - Całość jest w `.dungeon-page` (`__main` / `__side`).
  - `DungeonResult`: `.dungeon-results__plate` (zmienne `--dungeon-art`, `--dungeon-color`,
    wariant według `outcome`), fakty jako `dl`, łupy w `.item-slot`, kara
    w `.dungeon-results__penalty`.
  - Teksty i dane bez zmian.
- `src/ui/dungeons/dungeons.css`
  - Usunięte reguły `.dungeon-carousel*`, `.dungeon-arrow*`, `.dungeon-preview*`
    i `.dungeon-roster` (nieużywane).
  - Przepisane reguły `.dungeon-facts`, `.dungeon-rules`, `.dungeon-ranking*`, `.dungeon-wallet`
    (jeden wiersz), `.dungeon-enter` (sticky) i `.dungeon-results*`.
  - `.game--dungeon .player-frame__effects` nie zawija już buffów: szerokość
    przeszła na `.game--dungeon .effect-scroll`, a samo przewijanie jest w `index.css`.
  - Przycisk `.hud__menu--dungeons` ma jedno tło `menu-dungeons.webp?v=244d782e`.
- `src/ui/dungeons/DungeonLoot.tsx`: `DungeonPotions` dostał `onDrunk`; udane wypicie
  zamyka torbę (prośba właściciela: okno ma znikać po wypiciu).
- `scripts/lc/dungeon-art.mjs` i `scripts/lc/ui.mjs`: `menu-dungeons` to teraz znak podziemi
  z `Map.tex` w ramce `menu-frame` (TopUI), składany przez `dungeonButton()`.
  `public/ui/lc/menu-dungeons.webp` jest wygenerowany na nowo.
  Po ponownym uruchomieniu skryptu podbij `?v=` w CSS.
- `src/ui/hud/MonsterBookPanel.tsx`: usunięte tylko wiersze żywiołów (i `elementName`).
  Twój podział Worlds / Dungeons jest nietknięty.
- Wspólne miejsca, które działają też w Twojej rundzie:
  - `runSpeed()` ma limit 20 m/s, więc ruch w `dungeons.ts` także.
  - `potionSupply` przekazuje próg suwaka do `refreshDungeonPlayer`.
  - `drinkPotion` może zwrócić `'stronger'` (Super Haste kontra Haste).
  - Sloty mikstur są w `hud__dock` nad paskiem skilli.

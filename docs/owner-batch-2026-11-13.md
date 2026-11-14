# Szósta i siódma partia zgłoszeń (Claude Code, 2026-11-13)

Zmiany po połączeniu z pracą Codexa do `01ef4c6` (World Boss, bilety Cash, Statua, kalendarze,
Laca Ball). SaveVersion pozostaje **19** (Codexa); nowe pola są opcjonalne i nie wymagają migracji.

## Szósta partia

1. **Zakupy i skrzynki w stylu dropu:** przedmioty, które trafiają do torby poza walką (zakup w
   sklepie Cash, otwarcie skrzynki), wypływają po lewej tak samo jak drop (`BagFeed`).
2. **Portfel Cash:** cienkie pole z monetą i przycisk **Donate** (okno z informacją o
   doładowaniu: 1 € = 1000 Cash, PayPal, Discord, „Donations open soon”).
3. **Okno oferty** w sklepie: nagłówek, opis i panel zakupu w częściach `Cashshop.tex`.
4. **Ceny ÷5** we wszystkich ofertach sklepu Cash (tanio, bez pay2win).
5. **Otwieranie skrzynek:** wynik wypływa po lewej; przy więcej niż jednej skrzynce okno z
   tabelą, co wypadło i ile.
6. **Przycisk „?”** przy skrzynce: tabela nagród i szans.
7. **Multi-open** zamiast Open all: wybór liczby (−/+, suwak, 10/50/100/Max). Zabezpieczenie na
   etap Supabase opisane w [supabase.md](supabase.md) (jedna transakcja, losowanie na serwerze,
   klucz idempotencji, dziennik).
8. **Zwoje resetu podziemi** (sklep Cash, 40 Cash): Belfist / Procyon / Maargadum Reset Scroll,
   id **95021–95023** (95011–95016 to bilety Cash Codexa). Jedno użycie dodaje jedno wejście na
   dziś do danego podziemia: `2/2 (+1 extra)` na zielono, po rundzie `3/2`. Ikony zwojów zmienione
   na Mediocre / Average / Elegant Scroll (10/9/14, 10/9/15, 10/10/0), bo poprzednie należały do
   Platinum Training Spell i Lucky Spell Book, które teraz są w sklepie.
9. **Ekran ładowania podziemia:** grafika podziemia, nazwa, „Loading dungeon…” i pasek klienta
   (`DungeonLoading.tsx`); runda czeka (`dungeonSession.loading`), aż ekran zniknie.
10. **Atak tylko w miejscu:** bohater biegnący joystickiem nie atakuje; rozpoczęty zamach
    przepada bez kosztu odnowienia skilla, cel zostaje zapamiętany (`dungeonStep`).
11. **Mikstury w podziemiu:** auto-picie działało (sprawdzone: przy progu 95% wypił miksturę HP),
    ale ustawień slotu nie dało się otworzyć na telefonie (przytrzymanie 450 ms). Obok slotów jest
    teraz przycisk ustawień (ikona System klienta): jedno okno z zakładkami HP / MP, AUTO, próg i
    wybór mikstury. Otwarte okno pauzuje rundę. Tap na slocie nadal pije.
12. **Niebieska poświata kryształów** jak złota pod skrzynką: plama światła, krótki słup i iskry
    (trzy siatki instancji, maks. 160 kryształów naraz).

## Siódma partia

1. **Komunikat po wypiciu zawsze ze statystykami:** boost pokazuje zmienione statystyki oraz to,
   czego nie widać w statystykach (kradzież, Berserker, EXP/SP/Gold/Drop). Gdy nic się nie
   zmieniło (zwój nagród albo ten sam boost drugi raz), pokazuje własne wiersze efektu.
2. **Platinum Adrenaline (2138) i Super Haste Potion (2845) tylko za Cash:** usunięte ze sklepów
   za złoto, także z towarów Juno z `t_shopitem` (`CASH_ONLY_GOODS`). 100 Cooldown zostaje.
3. **Premie EXP / SP / Gold / Drop z przedmiotów, jak na serwerze** (`CAssistList::Apply`,
   `PC.cpp` AddExpSP, `Battle_NPCDropItem.cpp`):
   - osobne kroki: Blessed Iris (stawka `hcCashExpUp`), Experience Scroll 971 i Effort Scroll 973
     ×3/2, Lucky Scroll 972 i Huge Lucky Scroll 5080 ×2 (jedna flaga `hcScrollDrop`, więc razem
     dalej ×2; poza tym ten sam skill 240 z SF_NOTDUPLICATE odrzuca drugi), Superior Huge Lucky
     Scroll 5081 ×4;
   - sumowane `hcSPPlusPer100`: Platinum Super Skill Pill +200, Super Skill Pill +100, Platinum
     Training Spell +50 (np. +200 i +50 dają ×3,5, nie ×4,5);
   - **Lucky Spell Book 2141** (fioletowy): każde losowanie slotu dropu ×2 z szansą 20%, złoto ×2 z
     szansą 80%;
   - działają na polu, na wyprawie i w podziemiach; okno Character pokazuje sumę z opcjami.
     Serwer obcina po każdym kroku, my iloczyn raz (różnica co najwyżej 1–2 punkty).
     Pominięte jednorazowe wzmacniacze „na jedno zabicie” (882–885, 2855): rozliczanie paczek zabić
     i wypraw wymagałoby osobnego zużycia efektu; do decyzji.
4. **Kradzież HP / MP widoczna jak w kliencie:** udana kradzież mikstury odtwarza grupę
   `HP_STEAL` / `MP_STEAL` z `Effect.dat` na bohaterze (`SessionState.cpp`
   `MSG_EFFECT_ETC_HP_STEEL` → `PCStartEffectGroup`). Eksport efektów dopisał tylko te dwie grupy
   (7 efektów, 4 systemy cząstek, tekstury już były); `effects.json?v=6`. Wygląd przez nasz adapter
   orbit i smug, nie pełny renderer klienta.
5. **Liczby w podziemiu jak na polu:** obrażenia zadane i otrzymane, krytyki, leczenie, Miss,
   ogłuszenie, nazwy skilli; ten sam przełącznik w ustawieniach.
6. **Okno Expedition bez zamrożenia:** szacunek godziny liczy się po narysowaniu okna (najpierw
   „…”), budżet próbki 1200 s dzielony między odcinki boostów (min. 180 s), a ponowne liczenie
   tylko przy zmianie bohatera lub pełnej minuty boostu (wcześniej po każdym zapisie, stąd
   zacinanie przewijania). Z 6 boostami: 183 ms zamiast 555 ms na komputerze.
7. **Powrót z wyprawy:** sekcja „Boosts used” z ikonami, działaniem i czasem, jak zużyte mikstury.
8. **Zakładanie akcesorium:** okno z trzema slotami (Accessory 1–3), co jest w każdym i jaka będzie
   różnica statystyk, przyciski Wear here / Replace.
9. **Sklep Cash:** Lucky Scroll 10, Lucky Spell Book 50, Huge Lucky Scroll 50, Experience Scroll
   10, Effort Scroll 10, Platinum Training Spell 40, Super Skill Pill 50 i paczka Fortune Package
   (2× Lucky Spell Book, 6× Lucky Scroll, 6× Experience Scroll) za 150 zamiast 220.

## Ósma partia

Punkty 1–8 zgłoszenia były powtórzeniem siódmej partii (już wdrożonej). Nowe:

9. **Minerały ataku i obrony na każdym poziomie** (498–501: Physical / Magical Attack / Defense
   Mineral). Jak na serwerze (`doFuncItem.cpp`, `IPOTION_UP`): minerał rzuca skill `a_num_0`
   (104–107) na poziomie z flagi przedmiotu, nie z `a_num_1`. Import zapisuje wszystkie poziomy
   (`PotionDef.levels`: 15 poziomów, Magical Defense 14), np. Physical Attack Lv 9 = +95, Lv 15 =
   +155, 5 minut. Poziom przechodzi przez całą ścieżkę: picie w polu (`combatSession.drink`) i w
   podziemiu (`drinkDungeonPotion`), zużycie stosu tego poziomu, raport (`reportedBoosts`
   odrzuca podniesienie poziomu), zapis boostów (`OwnedBoost.flag`), wyprawy i sanitizer.
   Słabszy minerał jest odrzucany, gdy działa mocniejszy (`CanApply`), mocniejszy zastępuje słabszy.
10. **Etykieta „Lv N” na ikonie** w prawym górnym rogu (`.item-slot__level`), ilość została na dole.
11. **Księgi przywołania World Bossa** (sklep Cash, 500 Cash): Juno / Dratan / Merac / Egeha Boss
    Summoning Book, id **95031–95034**, ikony kolorowych ksiąg przywołań klienta (ItemBtn6 rząd 6).
    Użycie napełnia pasek bossa swojej mapy (`applyWorldBossBook`), potem przywołanie jak zwykle;
    próba nie jest oznaczana jako pomoc DEV. Odmowa przy pełnym pasku, w walce z bossem, na wyprawie
    i w podziemiu. Cena własna: ponad 5× bilet 100 Cash, który każdy World Boss daje, więc księgi
    nie zwracają się w Cash.
12. **Przycisk ItemShop:** zamiast prezentu oryginalna niebieska kula „Shop” klienta (TopUI, część
    `shop-orb`, `menu-shop.webp?v=695ce5b6`).

Oprócz tego: test AFK „drinks the potions…” trwał 4–5 s także przed zmianami i przekraczał
domyślny limit 5 s na CI; dostał własny limit 20 s.

## Dziewiąta partia

Odpowiedzi właściciela: wzmacniacze „na jedno zabicie” i Platinum Training Spell Book 2139
**nie są dodawane**; cena ksiąg World Bossa (500 Cash) zostaje.

4. **Laca Ball jak w kliencie.** Okno złożone element po elemencie z `CUILacaball`
   (`UILacarette.cpp`, `_initBackground` / `_initCourseInfo` / `_initBallInfo` /
   `_initRewardBallInfo`): każdy kawałek z `lacaball.tex` w swoim prostokącie i UV, w pikselach okna
   500×375, jedna skala CSS (`--K`). Cała tekstura idzie jako jeden atlas
   (`public/ui/lc/lacaball-atlas.webp`, `scripts/lc/lacaball-gui.mjs`). Po lewej maszyna z drżącymi
   kulami i Startem, po prawej pasek żetonu ze strzałkami, trzy pola kursów (ikona głównej nagrody,
   pozostało/maks w kolorach `_queryColor`, poświata wybranego kursu 0x55), wiersz puli kursu,
   tabela nagród z ramkami nazwy i liczby, przyciemnienie wyczerpanej nagrody (0xA0), kapsuła
   nagrody na środku okna. Kula po spadku zostaje w koszyku (koszyk ją przykrywa, jak w
   `_renderAnim`) i znika razem z pojawieniem się kapsuły. Wysoki telefon: maszyna (×0,7) nad
   panelem, te same elementy. Auto Draw ×2 pod belką tytułu. Logika rundy Codexa bez zmian.
5. **Kalendarz** z oryginalnymi znakami `calendar.xml`: czerwone kółko wokół dzisiejszej daty
   (`img_today`), żółta poświata zaznaczenia o stałej szerokości, złoty „+” na niedzielach
   (`img_plus`), czerwona nazwa niedzieli, nagrody w slotach ekwipunku z ilością w rogu, minione
   dni szare, odebrane z zielonym ✓, miesiąc rysowany pełnymi tygodniami (puste pola jak siatka
   6×7 klienta). Nowe części `calendar-today` i `calendar-plus` w `scripts/lc/ui.mjs`.
6. **ItemShop:** zakładki na wpuszczonym pasku, każda na ramce slotu sklepu, aktywna ze złotą
   poświatą. Okno Donate bez rozciągniętego paska: panel kursu z niebieską monetą Cash i pakiety
   na kartach ofert sklepu (cena w pasku nagłówka, Cash i bonus pod spodem).

Punkty 5, 7, 8, 10–13 weszły wcześniej (commit `acc4b33`):

5. Sloty mikstur w podziemiu otwierają menu dotknięciem, jak w polu; bez osobnego przycisku.
6. Pola wartości w opisie przedmiotu mają równą szerokość (`subgrid`).
7. DEV: jeden przycisk dodaje 1 000 000 000 złota, drugi 10 000 SP.
8. Lucky Spell Book w Bonuses w pełnym wierszu („Drop ×2 on 20%, gold ×2 on 80%”).
9. Hunting record: „Expedition time” (`CharacterStats.expeditionSeconds`, liczony przy
   odbiorze wyprawy, maks. 8 h na wyprawę; opcjonalne pole, bez migracji).
10. Buffy podziemi: Moon Cake i Stars zastąpione buffami klas: Knight 1108 (poziom 8) i Titan
    400 (poziom 6), odbicie obrażeń (`reflect`).
11. Atak bez animacji po zatrzymaniu: krok logiki zakończony zatrzymaniem był liczony jako bieg.
    `DungeonRun.moving` mówi scenie, czy bohater w tym kroku się ruszał.

Nadal SaveVersion **19**. Weryfikacja: **673 testy / 87 plików**, check, Chromium (390×844,
320×568, 360×640, 390×664, 844×390, 568×320, 768×1024, 1280×800).

## Pytania do właściciela

- Nadal otwarte: źródło Cash, „Kar/Neon 12 lv”, poziom 12 czy 10 dla wycia konia.

## Dla Codexa: co zmieniłem w Twoich plikach

- Minerały 498–501 (Twoje `ItemStack.flag` z nagród Statui) działają teraz jak boosty z poziomem
  z flagi: `PotionDef.levels`, `potionAtLevel`, `PotionSupply.flag`, `ActiveEffect.flag`,
  `OwnedBoost.flag`; `countOwned(inventory, itemId, flag?)`. Statua i jej wagi bez zmian.
- `logic/worldBoss.ts`: nowa `applyWorldBossBook` (księgi 95031–95034, `data/worldBossBooks.ts`);
  `chargeWorldBoss`, `summonWorldBoss` i `fillWorldBossCharge` bez zmian.
- `logic/afk.test.ts`: limit 20 s dla testu mikstur na wyprawie (CI przekraczał 5 s).

- `logic/dungeons.ts`: `dungeonStep` nie atakuje w ruchu (`moving`), porzucony zamach zeruje
  odnowienie skilla; `dungeonRewardMultipliers` deleguje do `effectRewardMultipliers` (te same
  kroki `rewards` plus sumowane `per100` i `lucky` mikstur); zwoje: `DungeonProgress.extra`,
  `dungeonEntries`, `applyDungeonScroll`.
- `session/dungeonSession.ts`: pole `loading`; `scene/DungeonScene.tsx`: pauza na ekranie
  ładowania, `CrystalGlow`, teksty nad bohaterem i potworami, `playClientGroup` przy `steal`.
- `ui/dungeons/Dungeons.tsx`: pauza pętli przy `loading`, wejścia `used / limit (+N extra)`;
  `dungeons.css`: `.zone-loading.dungeon-loading`.
- `logic/dungeons.test.ts`: test długiej mikstury kupuje Adrenalinę w sklepie Cash (nie ma jej już
  w sklepie za złoto).
- `logic/combat.ts`: nowe zdarzenie `{ type: 'steal', target, kind }`; `ActiveEffect.per100`,
  `lucky`; `PotionDef.rewardsPer100`, `lucky`, `magics` (CanApply dla boostów z `bSkip`).
- `logic/loot.ts` / `rewards.ts`: parametr `lucky` w `rollSourceDrops`, `monsterDrops`,
  `rolledReward` (dodatkowe losowanie tylko z aktywną Lucky Spell Book).
- `afk.ts` `estimateHourly`: próbka odcinka `max(180, 1200 × udział)`; `useHourlyEstimate`
  zwraca `null` do pierwszego pomiaru.

Dziewiąta partia:

- `ui/lacaball/LacaBall.tsx`, `lacaball.css`: nowy widok według `CUILacaball`; `useLacaBallRound`,
  `logic/lacaball.ts` i dane bez zmian. Kula istnieje w fazach `rolling` / `claiming` / `result`
  (klasy `is-landed`, `is-fading`); `landed()` wywołuje tylko koniec spadku (lub jego zastępstwo
  przy ograniczonym ruchu), nigdy zanikanie. Wycinki `lacaball-*.webp` z
  `lacaball-assets.mjs` nie są już używane przez okno (tylko `menu-lacaball.webp`); zostały w repo,
  bo tworzy je Twój skrypt. Można je usunąć razem z listą `parts`, jeśli się zgadzasz.
- `ui/calendar/RewardsCalendar.tsx`, `calendar.css`: inne znaczniki dni (`calendar-day__slot`,
  `__number`, `__today`, `__plus`), puste pola na końcu miesiąca; logika odbioru i modal bez zmian.
  `scripts/lc/calendar-art.mjs` zapisuje też `calendar-today` i `calendar-plus`.
- `logic/dungeons.ts`: `DungeonRun.moving` (ustawiane w `dungeonStep`); filtr `DUNGEON_BUFFS`
  przyjmuje `reflect`. `scene/DungeonScene.tsx`: animacja biegu z `state.moving`.
- `logic/character.ts` / `save.ts`: `CharacterStats.expeditionSeconds` (sanitizer: 0 domyślnie).

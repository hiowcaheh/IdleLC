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

## Pytania do właściciela

- Wzmacniacze „na jedno zabicie” (Experience / Skill Point / Item Drop / Gold Booster, Platinum
  Drop Booster): dodać? Wymagają zużycia efektu przy zabiciu.
- Platinum Training Spell Book 2139: w bazie opis +50% SP, w kodzie serwera +15%. Na razie poza
  grą.
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

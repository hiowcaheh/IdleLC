# Źródłowe premie ulepszeń i 17 poprawek GUI

Punkt wyjścia: `fa66c0e`, 2026-11-03. Lista 1–17 odpowiada poleceniu właściciela
w [changelogu](../CHANGELOG.md). Nie zmieniono szans powodzenia, zużycia kamieni,
wymiany 10:1, zasad porażki, braku niszczenia ani limitu +15. SaveVersion pozostaje 14.

## Wartości ulepszeń

Wzór pochodzi z `GameServer/PC.cpp:7048–7098` i
`Engine/Entities/Items.cpp:186–233`. Serwer zwraca wynik całkowity, klient odejmuje
bazę do podpisu w tooltipie. `itemUpgrades.ts` jest wspólnym kalkulatorem dla
arkusza Character, walki, estymacji AFK, porównania i szczegółów przedmiotu.

Dla poziomów przedmiotów dostępnych w obecnym zakresie gry:

| Plus  | Wzór                      | Przykład dla bazy 100, przed premiami progowymi |
| ----- | ------------------------- | ----------------------------------------------: |
| 0     | baza                      |                                             100 |
| 1–10  | `trunc(baza × 1,06^plus)` |                               +5: 133, +10: 179 |
| 11–15 | `trunc(baza × 1,07^plus)` |                              +11: 210, +15: 275 |

Nie jest to iloczyn dziesięciu kroków 1,06 i pozostałych 1,07. Przy zmianie progu
nowa podstawa potęgi dotyczy całego plusa. Płaskie premie nie są mnożone potęgą.

`ApplyItemPlusValue`, `PC.cpp:3509–3637`:

| Przedmiot         | Premie ATK/DEF                                                        |
| ----------------- | --------------------------------------------------------------------- |
| broń fizyczna     | od +6: +6 ATK; od +15: jeszcze +75 ATK                                |
| broń magiczna     | od +6: +4 MATK; od +15: jeszcze +50 MATK                              |
| zbroja bez tarczy | od +8: +10 DEF; od +10: +10 MDEF; od +15: jeszcze +100 DEF / +50 MDEF |
| tarcza            | od +15: +100 DEF / +50 MDEF                                           |

Podtypy fizyczne/magiczne odpowiadają przełącznikom serwera. Dla broni rare płaski
ATK/MATK jest wewnątrz potęgi (`PC.cpp:3103–3126`); dla zbroi rare DEF/MDEF poza nią
(`PC.cpp:3262–3304`). Wymagany poziom pomniejszony opcją 49 decyduje o gałęzi wzoru.

Nieulepszony sprzęt zachowuje dotychczasową bazę adaptera gear-reference. Przyrost
ulepszenia jest dodawany jako liczba punktów właściwego kanału, bez ponownego
skalowania przez adapter. Baza 100 na +15 daje 356 ATK (275 +6 +75), więc do ataku
walki dochodzi 256; pancerz 80/30 daje 330 DEF i 142 MDEF. Dla tarczy wartości to
320/132. Źródłowy arkusz rozdziela oba kanały; pojedynczy DEF adaptera walki otrzymuje
fizyczny przyrost. Główny damage, weak/strong/hard, zasięg normalnego ataku i pełne
liczniki rare pozostają wcześniej opisanym adapterem; ta partia przenosi wzrost
ATK/DEF, a także źródłowe +3% hit od +8 dla właściwych podtypów broni.

## Osobne linie +15

`UITooltip.cpp:1237–1270,1357–1367` używa napisów 1891–1894. Odczytano je z
`Local/us/String/strClient_us.lod` jawnego klienta 2015, według
`UIManager.cpp:4188–4220` i `Help/Loader.cpp`:

- `Attack Power +75`
- `Magical Attack power +50`
- `Defense power +100`
- `Magic Defense power +50`

Wyświetlane są pod odpowiednimi polami, oddzielnie od przyrostu wykładniczego.
Tak jak oryginalny tooltip, podpis +15 pokazuje samą premię tego progu; wcześniejsze
+6/+4 i +10 nie są do niej dopisywane. Pełny wynik Character zawiera wszystkie
właściwe premie progowe. Zapis przedmiotu nadal przechowuje tylko jego plus i opcje;
istniejące przedmioty są przeliczane bez migracji i bez utraty ulepszenia.

## Szybkości i szczegóły skilla

`Attack interval` jest końcowym czasem między zwykłymi ciosami. Zielone `−0,20 s`
przy `1,00 s` oznacza skrócenie względem bazowego interwału, np. z 1,20 s do 1,00 s.
Nie jest drugą wartością do odjęcia. Walk speed ukryto tylko w widoku Character.

Niejasne „Cast time: Normal” i „Skill reuse time” zastąpiono jednostkami:

- **Cast speed:** procent skracający przygotowanie skilla, z odpowiednią animacją.
- **Cast time adjustment:** stała korekta przygotowania w sekundach; zero znaczy brak korekty.
- **Cooldown adjustment:** stała korekta odnowienia w sekundach.
- **Cooldown reduction:** procentowe skrócenie odnowienia po tej korekcie.

`skillPreparationTime`, `skillCooldownTime` i istniejący `skillMpCost` są wspólne dla
walki i modalu. Przy zmienionym czasie modal pokazuje wynik oraz bazę. Na przykład
cast 2 s, +20% cast speed i −0,2 s daje 1,4 s; cooldown 8 s, korekta −2 s i redukcja
50% daje 3 s. Rozwijane objaśnienie pozostaje dostępne na telefonie w Character.

Układ informacji odpowiada rodzinie `CUITooltip::SetSkillData` (:2415–2432): nazwa,
typ i cel, oryginalny opis, wymagania dostępne w danych gry, koszt nauki, sprzęt,
wymagane umiejętności, HP/MP, czas przygotowania, odnowienie, czas trwania i efekty.
Widać bieżący i następny poziom. Nauka, AUTO oraz przypisanie do paska nadal działają
w tym oknie. Niezaportowane pola klienta nie otrzymują wymyślonych wartości.

Poziom obok nazwy wystarcza; usunięto go spod ikon. Pasywne grafiki są przycięte do
koła razem z obramowaniem. Modal jest portalem nad listą, zamyka się przez Escape,
a odświeżanie statystyk nie przenosi co pół sekundy fokusu z przycisków.

## Oryginalne GUI i lista sklepu

Book używa oryginalnego prezentu Cashshop zamiast wykrzyknika. Dodano źródłowe
zakładki, obwódki list, papier sekcji nagród i pasek ItemCollectionbook; nagrody mają
nagłówki Kills / Rewards / Status. Podgląd modelu zachowuje wspólne tło Cashshop.
Character ma ikonę SP, źródłowe zakładki i nagłówki. Małe przyciski „+” z `skill_new`
są rodzeństwem pola wartości, więc nie zajmują miejsca wewnątrz liczby.
Appraiser i Shop używają tej samej rodziny zakładek, wierszy i podpisów. Settings ma
ramkę NewOption, wydzielone sekcje i przyciski wyboru pasujące do pozostałych okien.

Goods są sortowane według działania (HP, MP, regeneracja HP, regeneracja MP), a potem
mocy i czasu; kamienie i lupy są dalej. Rzeczywista oferta zawiera kolejno Small Mana
Potion (484), Medium Mana Potion (485), Great Mana Potion (724), dopiero potem
mikstury regeneracji. Nie zmieniono ich cen, mocy ani dostępności.

Nowe wycinki są zadeklarowane w `scripts/lc/ui.mjs`; odtwarzanie:

```sh
npm run convert-lc -- --client '<folder klienta 2015>' --only ui
```

| Nazwa                | Atlas              | x, y, szerokość, wysokość |
| -------------------- | ------------------ | ------------------------- |
| settings-window      | NewOption          | 0, 0, 256, 400            |
| book-window          | QuestBook          | 0, 0, 475, 331            |
| detail-window        | NewOption          | 270, 105, 178, 190        |
| client-section       | QuestBook          | 0, 346, 155, 32           |
| book-paper           | ItemCollectionbook | 246, 58, 480, 466         |
| book-row             | ItemCollectionbook | 13, 246, 193, 16          |
| book-progress        | ItemCollectionbook | 471, 778, 270, 34         |
| book-fill            | ItemCollectionbook | 32, 799, 168, 19          |
| gift                 | Cashshop           | 251, 358, 60, 60          |
| stat-plus / disabled | skill_new          | 1213, 70 / 98, 13, 13     |
| sp-icon              | skill_new          | 843, 550, 14, 14          |

Ramki są składane z górnej krawędzi, powtórzonego czystego boku i dolnej krawędzi.
Wnętrze paska postępu jest przyciemniane przy ekstrakcji; osobny wypełniacz jest
przycinany do rzeczywistego postępu. Surowe atlasy i tabele pozostają poza Git.

## Cała ilustracja ładowania

Najnowsze zgłoszenie zmienia wcześniejszą decyzję `cover`: główna ilustracja używa
`contain`. Widać cały jej źródłowy prostokąt, bez obciętych boków, skalowania w czasie
ani rozmycia. Osobna kopia grafiki w tle jest rozmyta i przyciemniona, wypełniając
pozostałe miejsce na ekranie pionowym. To dekoracyjne tło nie zmienia kadru głównej
ilustracji. Zachowano dekodowanie, pasek, oczekiwanie na kamerę, nazwę po wejściu
oraz reduced motion. Kod kamery nie jest zmieniany w tej partii.

## Walidacja

Wyniki: [raport walidacji](client-ui-upgrade-validation.json). Testy logiki obejmują
liczby źródłowe i granicę +10/+11, osobne kanały +15, tarczę, rare, dokładny przyrost
adaptera, podpisy i kolejność mikstur oraz korekty czasów. Dotychczasowe testy procesu
ulepszania kamieniami pozostają aktywne.

Przeglądarka sprawdza build produkcyjny przy 390×844 i 1280×900: Character, rozdanie
punktu, modal przedmiotu +15, aktywne/pasywne skille i naukę w modalu, Book,
Appraiser, Shop, Settings oraz pełną ilustrację na dwóch przejściach map. Osobna
kontrola końcowych szczegółów obejmuje też ekran 320×740, aktualny/następny poziom,
oryginalne podpisy +15 i zamykanie najwyższego modalu przez Escape.

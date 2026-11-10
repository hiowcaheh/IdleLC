# World Boss loot, Cash tickets i Statua Księżycowa (2026-11-10)

Baza etapu: `ba9ab98`. Zachowano poprzednie zmiany Claude i Codexa. Zmiany nagród
World Bossów oraz bilety Cash są regułami właściciela. Kamienie, zawartość skrzynki,
nagrody Statui i jej grafiki pochodzą z dostarczonych plików LC.

## Bieżący drop czterech World Bossów

Każdy boss gwarantuje następujące stosy, niezależnie od poziomu i buffów:

|    ID | Przedmiot                     | Liczba |
| ----: | ----------------------------- | -----: |
|   169 | Hero's Necklace               |      1 |
|   723 | Moon Stone                    |      5 |
|   759 | Medal of Honor                |      1 |
|   972 | Lucky Scroll                  |     10 |
|  2544 | Moonstone Box                 |     25 |
|  4917 | Platinum Small Healing Potion |     50 |
|  4920 | Platinum Small Mana Potion    |     50 |
| 95014 | 100 Cash Ticket               |      1 |

Usunięto Scroll of Memorizing (47), Crystal of Experience [Greater] (673) i Tool Aid
(786). Mikstury 45/485 zastąpiono 4917/4920. Mikstury zachowują źródłowy wymagany
poziom 60, 15 s działania i 25 s odnowienia: odpowiednio 100 HP/s i 50 MP/s.

`data/worldBosses.ts:worldBossDropTable` nakłada te zmiany na oryginalne wiersze.
`lc-data.json.worldBosses[].raidDrops` nadal przechowuje niezmienioną tabelę SQL.
Raid ACC 1828..1837 zachowują dziesięć niezależnych losowań i źródłowe szanse na
każde: 1% / 1,8% / 1,4% / 2%. Zwykłe sloty wyposażenia Balroga zostają.
Zapisane wcześniej okno łupów nadal pokazuje faktycznie przyznane stare nagrody.

## Bilety Cash

| Własny ID | Nazwa / wartość  |
| --------: | ---------------- |
|     95011 | 10 Cash Ticket   |
|     95012 | 20 Cash Ticket   |
|     95013 | 50 Cash Ticket   |
|     95014 | 100 Cash Ticket  |
|     95015 | 500 Cash Ticket  |
|     95016 | 1000 Cash Ticket |

Ikona to oryginalny złoty Phoenix Ticket 3217: `ItemBtn6.tex`, wiersz 0, kolumna 4.
ID, nominały i doładowanie są własnym systemem, nie funkcją znalezioną w serwerze LC.
Każdy boss daje jeden bilet 100 Cash; Cash dopisuje się dopiero po `Use` w ekwipunku.

`applyCashTicket` zużywa jedną sztukę i dodaje nominał do wspólnego `SaveData.cash`.
`LocalGameService.redeemCashTicket` zapisuje ekwipunek i saldo jednym zapisem.
Przy konflikcie drugiego klienta cofa stan w pamięci; brak biletu i przepełnienie
liczby całkowitej są odrzucane. Kolejka store aktualizuje portfel Item Shop od razu.
Bilety mają cenę złota 0. Starsze v16 nadal mają domyślnie 0 Cash.

## Moonstone Box

`GameServer/doFuncItem.cpp:7678`, `do_itemUse_MoonStoneBox`:
jedno losowanie `GetRandom(1, 1000)`, zużycie jednej skrzynki 2544, jeden kamień:

|   ID | Kamień            | Waga / 1000 |
| ---: | ----------------- | ----------: |
| 2545 | Poor Moonstone    |         520 |
| 2546 | Average Moonstone |         300 |
|  723 | Moon Stone        |         150 |
| 2547 | Good Moonstone    |          30 |

Perfect Moonstone 2548 nie jest wynikiem tej skrzynki. W oryginale istnieje osobne
łączenie kamieni; ten etap obejmuje otwieranie skrzynek i grę w Statui.
`BOX_PRIZES[2544]` używa tych samych granic losowania. Istniejące skrzynki Dungeons
zachowują swoje wagi 80/20. Dostępne Open, Multi-open i podgląd zawartości.
Wynik wielokrotnego otwarcia jest w stanie Inventory, więc nie znika razem z
ostatnią zużytą skrzynką. Nagrody korzystają z istniejącego BagFeed po lewej.

## Statua Księżycowa

Źródła:

- `newproject_data.sql`, tabela `t_moonstone_reward`;
- `GameServer/Server.cpp:5372`, `CMoonStoneRewardData::Load`;
- `GameServer/doFuncEvent.cpp:4106`, `do_EventNewMoonstone`;
- klient: `Engine/Interface/UIGamble.cpp`, `CUIGamble::Create`, `Render` i wybór
  pięciu normalnych kamieni; `Data/Interface/MoonStone.tex` klienta 2015.

Importer `scripts/lc/moonstone.mjs` zapisuje pełne nagrody w kolejności `a_giftindex`,
z liczbą sztuk i `a_giftflag`. Waga to `int(float(a_giftprob) * 10000.0)`, jak
w serwerze. Losowanie jest względem sumy wag, nie względem założonego 100%.

| Kamień     |   ID | Wiersze nagród | Suma wag | Poziom mineralów |
| ---------- | ---: | -------------: | -------: | ---------------: |
| Poor       | 2545 |              7 |  1000000 |                3 |
| Average    | 2546 |              7 |  1000000 |                6 |
| Moon Stone |  723 |             11 |  1000000 |                9 |
| Good       | 2547 |             13 |  1020000 |               12 |
| Perfect    | 2548 |             14 |  1050000 |               14 |

Wiersze dodatkowego kamienia 6092 nie należą do pięciu normalnych przycisków klienta.
W przekazanych tabelach tych pięciu kamieni nie ma nagrody złota (19) ani broni.

`applyMoonstonePlay` sprawdza posiadanie kamienia, losuje jeden wiersz, zużywa jedną
sztukę i dodaje nagrodę. Serwis zapisuje stawkę i wynik razem. Animacja nie losuje
ponownie i nie decyduje o wypłacie. Pole `ItemStack.flag` zachowuje poziomy mineralów
498..501; stosy łączą się po ID i flag, pokazują poziom w GUI i BagFeed, zachowują go
po reloadzie. Sprzedaż usuwa wyłącznie wybrany wariant. Import nagród zachowuje też
pozostałe oryginalne przedmioty (materiały, Butchers Box, boostery i tokeny).

Przycisk 40 px pod Item Shop ma tę samą ramkę zdarzeń klienta i ikonę Moon Stone.
Modal używa oryginalnego wizerunku Statui, pięciu pól nagrody, przycisków kamieni,
Start/Stop i Exit. Checkbox pochodzi z NewOption. `moonstone-art.mjs` eksportuje
nowe fragmenty atlasu bez zastępowania dotychczasowych grafik.

Automat jest dodatkiem właściciela: jeden zapis na rundę, wybrany kamień, 900 ms
animacji i 450 ms widocznego wyniku. Stop, Exit, zamknięcie modalu i ukrycie karty
kończą powtarzanie; wyczerpanie wybranego kamienia również. Nie przełącza sam grade,
nie działa offline i nie przywraca automatu po reloadzie. Serwis blokuje grę podczas
ekspedycji, Dungeons i próby World Bossa. Nagrody pojawiają się przez ten sam BagFeed
co zakupy w Cash Shop.

SaveVersion nadal **16**. Bieżący serwis jest lokalny; przyszły backend powinien
przenieść zużycie kamienia/biletu oraz nagrodę/Cash do jednej własnej transakcji.

## Weryfikacja

`npm run check`: **619 testów / 77 plików**, lint, formatowanie i TypeScript.
`npm run build`: poprawny. Testy sprawdzają wszystkie nominały i ikony, pojedyncze doładowanie i reload,
konflikt zapisu, dokładnie 1000 wyników skrzynki, granice każdego wiersza nagród
Statui, poziomy mineralów, sprzedaż wariantów, limity wejścia oraz nowe nagrody
każdego z czterech bossów.

Chromium na buildzie produkcyjnym, 320/390/1280 px: jeden kamień, następnie pełne
100 sztuk Average w automacie i zatrzymanie przy zerze (101 gier z pierwszą próbą).
Stop, Exit i test zdarzenia visibilitychange nie uruchamiają następnej rundy.
Sprawdzono sześć nominałów, saldo 25 → 1705 Cash, zużycie po jednym bilecie i reload.
Otwarcie całego stosu 25 skrzynek dało 10 Poor, 7 Average, 6 Moon Stone i 2 Good;
okno wyników pozostało po zużyciu ostatniej skrzynki. Bez błędów JS/konsoli/HTTP.
Są to przygotowane zapisy, nie pomiar naturalnego balansu ani częstości dropu.

Osobna próba produkcyjna: Balrog pokonany przy ×20 (bez DEV Kill target), osiem
gwarantowanych stosów zgodnych z tabelą. Stoper 150450 ms, assisted=true. Reload
okna zachował pojedynczą wypłatę. Zdobyty bilet został zużyty w Inventory, a Item
Shop pokazał 100 Cash. Bez błędów JS, konsoli, HTTP i żądań.

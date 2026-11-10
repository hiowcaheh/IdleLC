# World Boss loot, Cash tickets i Statua Księżycowa (2026-11-10)

Nowsza partia na bazie `cb1a4a4`: Good ×5 i Perfect ×3 u każdego bossa, poprawione
ikony Statui i Cash Ticket, Statua bez dodatkowej ramki. [Kalendarz](login-calendar.md)
wprowadza zapis v17.

Baza pierwotnego etapu: `ba9ab98`. Zachowano poprzednie zmiany Claude i Codexa. Zmiany nagród
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
|  2547 | Good Moonstone                |      5 |
|  2548 | Perfect Moonstone             |      3 |
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

Aktualna ikona to pomarańczowy bilet 7341 z `ItemBtn15.tex`, wiersz 1, kolumna 2.
Zastępuje poprzedni zwój Phoenix Ticket; nominały i działanie pozostają takie same.
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

`beginMoonstonePlay` sprawdza kamień, losuje jeden źródłowy wiersz, zużywa sztukę
oraz zapisuje opcjonalne `CharacterData.moonstoneSpin` (ID rundy, kamień, wynik,
czas początku). Nagroda nie trafia jeszcze do inventory ani BagFeed. Po zakończeniu
animacji `finishMoonstonePlay` wypłaca zapisany wynik i usuwa pending jednym
zapisem. Wymaga zgodnego ID i co najmniej `MOONSTONE_SPIN_MS` od rezerwacji.
Duplikat i konflikt zapisu są odrzucane; błąd zapisu cofa stan serwisu w pamięci.
Wypłata używa bieżącego inventory, zachowując przedmioty zdobyte w międzyczasie.

Źródłowe losowanie i wagi pozostają bez zmian. Pole `ItemStack.flag` zachowuje
poziomy mineralów 498..501; stosy łączą się po ID i flag, pokazują poziom w GUI i
BagFeed, zachowują go po reloadzie. Sprzedaż usuwa wyłącznie wybrany wariant.
Import nagród zachowuje też pozostałe oryginalne przedmioty.

Przycisk 40 px pod Item Shop ma jedną ramkę zdarzeń klienta oraz twarz Statui
wyciętą z MoonStone.tex (`menu-moonstone.webp`). Podczas próby World Bossa i okna
łupów jest ukryty, aby na wąskim ekranie nie nachodził na stoper. Modal pokazuje sam
oryginalny wizerunek Statui, pięć widocznych pól, przyciski kamieni, Start/Stop
i Exit oraz informacje pod nimi, bez zewnętrznej ramki i dodatkowego X. Checkbox pochodzi z NewOption.

Od tej partii (baza `c632560`) animacja jest jednym poziomym paskiem 42 ikon:
przesuwa się od prawej do lewej przez 3000 ms i zwalnia do wygranego przedmiotu
pod środkowym znacznikiem. Pozostałe ikony pochodzą z tej samej puli, są wyłącznie
wizualne i nie zużywają RNG gry. Dopiero `animationend` i kolejna klatka uruchamiają
wypłatę, nazwę nagrody oraz powiadomienie BagFeed po lewej. Przy ograniczeniu
animacji systemowym ustawieniem ikony czekają ukryte przez ten sam czas; ujawnienie
i wypłata następują razem po końcu animacji.

`useMoonstoneRound` prowadzi fazy idle/starting/rolling/claiming/waiting/paused.
Automat ma 700 ms widocznego wyniku przed kolejną rundą. Stop wyłącza powtarzanie,
ale bieżąca runda kończy animację. Exit i zamknięcie modalu również czekają na
zatrzymanie i przyznanie bieżącej nagrody. Ukrycie karty zatrzymuje automat i
pauzuje losowanie; Resume odtwarza je od początku bez nowego kamienia i losowania.
Reload zachowuje rezerwację, otwiera okno w stanie paused i wymaga Resume.
Przerwanie nie przyznaje nagrody za sam upływ czasu. Automat nie przywraca się po
reloadzie, nie zmienia sam grade i kończy przy braku wybranego kamienia.

Serwis blokuje rozpoczęcie gry podczas ekspedycji, Dungeons i próby World Bossa.
Rozliczenie już zapisanej rundy może się zakończyć niezależnie od późniejszego
stanu polowania. Rezerwacja Statui pozostaje opcjonalna i sanitizowana; bieżący SaveVersion to **17**
po dodaniu [kalendarza logowania](login-calendar.md).
Bieżący serwis jest lokalny; przyszły backend powinien zachować rezerwację i
jednorazowe rozliczenie po ID, z transakcją na każdą z tych dwóch operacji.

## Weryfikacja

Partia poziomego paska: `npm run check`, **623 testy / 77 plików**, i build poprawne.
Dodatkowe testy obejmują brak wypłaty przed czasem, blokadę drugiego losowania,
zachowanie rezerwacji i poziomu mineralów po reloadzie, powtórny odbiór oraz
konflikt dwóch klientów przy wypłacie. Granice źródłowych pul nadal sprawdzane.

Chromium 320/390/1280 px potwierdził ruch w lewo bez przesunięcia pionowego oraz
zatrzymanie środka nagrody pod znacznikiem (odchylenie poniżej 0,4 px). Inwentarz
nie zawiera nagrody podczas ruchu, BagFeed następuje po rzeczywistym animationend.
Sprawdzono też systemowe ograniczenie animacji. Build produkcyjny 320/390 px:
pojedyncza gra, automat do zera, Stop i Exit połączone z ukryciem karty, ponowne
otwarcie zapisanego losowania i reload. Resume zużywa zero dodatkowych kamieni;
wynik wypłaca się raz. Ukrycie symulowane zdarzeniem visibilitychange. Brak błędów
JS, konsoli, HTTP i żądań. Przygotowane zapisy, bez pomiaru balansu lub FPS.

Pierwsza partia (`667c494`): **619 testów / 77 plików**, lint, formatowanie i TypeScript.
`npm run build`: poprawny. Testy sprawdzają wszystkie nominały i ikony, pojedyncze doładowanie i reload,
konflikt zapisu, dokładnie 1000 wyników skrzynki, granice każdego wiersza nagród
Statui, poziomy mineralów, sprzedaż wariantów, limity wejścia oraz nowe nagrody
każdego z czterech bossów.

Próby pierwszej partii, przed zmianą animacji: Chromium na buildzie produkcyjnym,
320/390/1280 px: jeden kamień, następnie pełne
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

Dodatkowo 320 px: skrót Statui znika w próbie bossa, stoper mieści się w ekranie,
a po Leave skrót wraca i otwiera okno. Bez błędów JS, konsoli i żądań.

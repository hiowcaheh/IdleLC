# Laca Ball: aktualny system puli (2026-11-11)

Baza aktualizacji: `568b06b`, branch main. SaveVersion **19**. Wersja 18 używała
starszego `t_lacarette`; aktualny system odpowiada `MSG_EX_LCBALL`, `t_lcball`
i SubHelper, których używa okno `CUILacaball` z dołączonego klienta.

## Źródła i reguły

- `SubHelper/doFuncCommand.cpp:279`, `do_Command_LCBallinfo`: lista walut,
  kursy, suma `a_item_remain/a_item_max` oraz pięć wierszy nagród w kolejności
  `a_order`. Klient rysuje liczniki w `UILacarette.cpp:378..447`.
- `SubHelper/doFuncCommand.cpp:371`, `do_Command_LCBalluse`: losowanie z sumy
  pozostałych sztuk, zmniejszenie wybranego wiersza o jeden. Zachowana granica
  źródłowa: `GetRandom(0, totalRemain - 1)`, odejmowanie, porównanie `<= 0`.
  Obejmuje to źródłowe zachowanie na granicy pierwszego wiersza. Nie zastępować
  stałymi procentami ani dawną tabelą `t_lacarette`.
- `SubHelper/doFuncCommand.cpp:442`, `do_Command_LCBallsuccess`: dopiero sukces
  nagrody z `a_order=0` przywraca `a_item_remain=a_item_max` dla całego wygranego
  kursu i tej waluty. Inne kursy i drugi żeton zachowują postęp.
- `GameServer/ProcSubHelperMsg.cpp:921`: jeden Token lub Gold token na losowanie.
  Usunięto cenę rosnącą co pięć gier i reset po 24h, które należały do starszego
  wariantu. Odczekanie doby, zmiana postaci i reload nie uzupełniają nowej puli.
- `newproject_db.sql` zawiera schemat `t_lcball`; dane są w osobnym
  `newproject_db-t_lcball.sql`. Pola `a_item_count` (ile otrzymujemy w wygranej)
  i `a_item_max` (ile takich wygranych jest w puli) to różne wielkości.

Włączone tylko 5123 Token i 5124 Gold token. Każda waluta ma kursy A..E, po
pięć nagród. Trzecia waluta ze źródeł, 6653, nie jest włączona na życzenie
właściciela. Główny wiersz ma zawsze maksymalnie jedną wygraną, `1/1`.

Limity sztuk po kolei, ze źródłowej bazy:

| Waluta     | A              | B               | C               | D               | E               |
| ---------- | -------------- | --------------- | --------------- | --------------- | --------------- |
| Token      | 1/10/5/50/1000 | 1/10/30/50/1000 | 1/10/30/50/1000 | 1/10/30/50/1000 | 1/10/10/50/1000 |
| Gold token | 1/10/30/50/500 | 1/5/10/50/500   | 1/5/10/30/500   | 1/5/30/50/500   | 1/5/10/30/500   |

Nowe konto zaczyna z pełnymi pulami, nie z częściowo zużytą migawką obcego
serwera z dumpa. Nagrody są doborem IdleLC, zgodnie z wcześniejszą zgodą
właściciela; konfiguracja w `src/game/data/lacaball.ts`. Wykorzystują istniejące
bilety Cash, kamienie, lupy, boosty, skrzynki i mikstury. Gold token nadal
pochodzi wyłącznie z ItemShop. Drop Tokena 1%, ceny pakietów i kalendarz bez zmian.

## Zapis i transakcje, dla Claude

`SaveData.lacaBall.pools[courseId]` to pięć liczników. ID 100..104 dotyczą
Tokena, 200..204 Gold tokena. Konto jest obecnie lokalne: pule są wspólne dla
jego postaci i kart przeglądarki, zapisywane w localStorage. To nie jest globalna
pula wszystkich graczy na hostingu GitHub Pages. Tak jak globalny ranking,
wymaga ona współdzielonego backendu; oryginał trzymał te rekordy w SubHelper DB.

Start zapisuje razem opłatę, odjęcie jednej wygranej oraz `pending` z ID rundy,
postaci, kursu, żetonu, `rewardIndex`, nagrodą i czasem animacji. Drugi Start
jest blokowany do rozliczenia. UI używa `lacaBallDisplayPool`: rezerwacja jest
ukryta w licznikach do odsłonięcia nagrody, żeby wiersz nie zdradzał wyniku przed
animacją. `finishLacaBall` dopisuje nagrodę do aktualnego inventory i usuwa
pending w jednym zapisie. Po jackpotcie uzupełnia tylko wygrany kurs.

Pozostają rollback pamięci po save-conflict, zabezpieczenie przed podwójną
wypłatą, zachowanie zakupów z czasu animacji i zakaz nowej gry podczas World
Bossa, Dungeons i ekspedycji. Zamknięcie lub ukrycie karty nie dopisuje nagrody;
Resume powtarza ten sam zapisany wynik, bez kolejnego żetonu i ubytku w puli.

Migracja 18→19 zachowuje już opłaconą starą rundę (kurs 1..3), jej cenę, nagrodę
i termin 3200 ms. Taki wynik nie zmniejsza nowej puli. Wszystkie pozostałe dane
postaci, Cash i dotychczasowe postępy pozostają zachowane.

## Okno i animacja

Okno poszerzone z 680 do 940 px, na telefonie ma mniejsze marginesy. Większa
część przypada na maszynę, węższa na listę po prawej. Trzy widoczne karty kursów
przewijają się strzałkami do pięciu, jak w kliencie. Karty pokazują stan całej
puli, a tabela ilość nagrody i pozostałe/maksymalne wygrane. Brak procentów.

Usunięto Exit. X ma własną grafikę `lacaball.tex`, poprawny narożnik i działa
także w trakcie losowania: zatrzymuje Auto i pozostawia rezerwację do Resume.
Ręczne losowanie trwa 2000 ms, Auto Draw ×2 trwa 1000 ms. Czas zapisany w rundzie
wyznacza animację i minimalny termin wypłaty; przełączenie Auto w trakcie rundy
obowiązuje następną. Kula opada i lekko odbija się w źródłowym miejscu, z płynną
interpolacją transformacji. Przy ograniczonym ruchu pozostaje ten sam czas wypłaty.

Kapsuła z nagrodą znika po 1500 ms. Potem Auto może rozpocząć kolejną rundę.
Odznaczenie Auto, X, ukrycie karty i koniec żetonów zatrzymują serię. Automat
nie wraca sam po ponownym otwarciu ani reloadzie.

Eksport danych, oryginalnych elementów i ikon:

```sh
node scripts/lc/lacaball-assets.mjs /path/newproject_data.sql /path/client /path/newproject_db.sql /path/newproject_db-t_lcball.sql
```

Historyczna weryfikacja pierwszego etapu jest w `lacaball-validation.json`.
Aktualny [zapis weryfikacji](lacaball-pools-validation.json) dotyczy skończonych pul.

## Weryfikacja

**654 testy / 82 pliki**, pełne check i produkcyjny build. Testy obejmują granice
losowania SubHelper, wyczerpane wiersze, odjęcie jednej wygranej, ukrycie rezerwacji
w widoku, reset wyłącznie trafionego kursu, konflikty zapisu, wspólny stan postaci
oraz zachowanie opłaconego wyniku v18. Osobne granice czasu 1000/2000 ms i próba
przedwczesnej wypłaty, migracja legacy z minimum 3200 ms.

Chromium na buildzie produkcyjnym: 390×844, 320×568, 360×640, 1280×900,
844×390 i 568×320. Pięć wierszy widocznych, okno bez przepełnienia. Strzałki
przechodzą przez pięć kursów, zmiana waluty wraca do A, koszt wynosi jeden.
Wymuszona przygotowanym zapisem główna wygrana uzupełniła wyłącznie wybrany kurs.
Kapsuła była widoczna około **1491 ms**, przy ustawieniu 1500 ms.

Sprawdzone kolejne rundy Auto po 1000 ms animacji, wyłączenie w trakcie obrotu,
X w trakcie gry, reload, Resume bez dodatkowego żetonu oraz zatrzymanie po
ukryciu karty. Osobny stary zapis v18 wypłacił zachowaną nagrodę, bez ponownej
opłaty i z zachowaniem wyłączonego Auto. Brak błędów strony, konsoli i żądań HTTP.
Próby używały przygotowanych postaci i pul; nie są pomiarem FPS ani balansu.

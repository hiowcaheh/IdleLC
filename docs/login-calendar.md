# Kalendarz nagród za logowanie (2026-11-10)

Baza prac: `cb1a4a4`. Nowy system właściciela, z grafikami oryginalnego klienta i
przedmiotami już używanymi w IdleLC. To nie jest kopia serwerowego attendance EXP;
progi czasu, kalendarze i tabela przedmiotów są regułami tej aplikacji.

## Układ od 2026-11-11

Nowsza aktualizacja: złota niedziela zajmuje cały dolny rząd Weekly. Każda
niedziela daje 500 Cash Ticket w każdym torze, również na końcu miesiąca.
Wspólny claim = dwa bilety, 1000 Cash po użyciu. Pozostałe reguły odbioru bez
zmian. Przycisk przeniesiony na lewo od Dungeons. [Szczegóły](lacaball.md).

Kliknięcie daty otwiera modal jej nagrody. Dzisiejsza data oraz przycisk pod siatką
pokazują oba dzisiejsze prezenty z pełnymi nazwami i ilościami. Dopiero Claim wywołuje odbiór; Return i Escape wracają do kalendarza. Dni przeszłe i
przyszłe mają podgląd bez odbioru. Stały podgląd i sekcja odbioru spod siatki
zostały usunięte, dzięki czemu główne okno mieści się bez przewijania. Kafelki
zawsze pokazują ilości; pełna nazwa jest w modalu.

Sprawdzenie tego układu: **634 testy / 79 plików**, check i build. Chromium na
buildzie produkcyjnym: 390×844, 320×568, 360×640, 1280×900, 844×390, 667×375
i 568×320. Obie zakładki mają zero przepełnienia w obu osiach i wszystkie dni
w granicach okna. Modal daje podgląd przed progiem, Return niczego nie wypłaca,
Claim wypłaca oba prezenty raz i oznacza obie zakładki. Escape zamyka tylko
najwyższe okno i przywraca fokus. Próby na przygotowanych zapisach; logika progu
10 minut pozostaje objęta testami serwisu opisanymi niżej.

## Reguły

- Jeden wspólny odbiór dziennie na konto lokalne, dla wszystkich postaci.
  Przycisk przyznaje razem dzisiejszą nagrodę tygodniową i miesięczną do ekwipunku
  bieżącej postaci. Obie zakładki oznaczają dzień jako odebrany.
- Wymagane 10 minut rzeczywistego czasu w widocznej karcie podczas gry postacią.
  Okna gry, podziemia i pauza nie przerywają bycia online. Ukryta karta, zamknięta
  gra i ekran wyboru postaci nie doliczają czasu. DEV ×20 również go nie przyspiesza.
- Czas sumuje się w obrębie dnia i zapisuje co 5 s. Po reloadzie zachowany postęp
  startuje z nowym interwałem, bez dopisywania czasu nieobecności.
- Reset o 00:00 UTC. Tydzień od poniedziałku; miesiąc ma faktycznie 28/29/30/31 dni.
  Można podglądać wszystkie daty, odbierać tylko dzisiejsze prezenty. Pominięte
  dni nie mają odbioru wstecz. Historia obejmuje najwyżej 62 odebrane daty.
- Przycisk kalendarza jest na lewo od Dungeons. Po osiągnięciu progu świeci.
  Podczas World Bossa jest ukryty razem ze skrótem Statui, poza stoperem walki.

## Nagrody

Konfiguracja: [src/game/data/loginCalendar.ts](../src/game/data/loginCalendar.ts).
Wiersze tygodnia od poniedziałku: Moonstone Box ×5, Heaven Stone ×3, Lucky Scroll
×3, Blessed Iris ×2, Platinum Super Skill Pill ×2, Good Moonstone ×3, 500 Cash
Ticket ×1. Miesiąc obejmuje też lupy, mikstury HP/MP, Super Haste Potion i bilety
Cash. Siódmy dzień daje 10 Cash Ticket, czternasty 20, dwudziesty pierwszy 50;
ostatni dzień miesiąca daje 100 Cash Ticket, z wyjątkiem niedzieli, która zawsze
daje 500 Cash Ticket.

Nazwy, działanie, wymagania i ikony przedmiotów są istniejące. Kalendarz nie
zmienia działania mikstur, kamieni, skrzynek ani nominałów Cash.

## GUI i źródła

**2026-11-14 (Claude Code):** dni ze znakami `calendar.xml`: `img_today` (czerwone kółko wokół
dzisiejszej daty, `calendar-today.webp`), `img_plus` na niedzielach (`calendar-plus.webp`),
poświata `calendar-selected` jako ramka stałej szerokości, nagrody w slotach, czerwona niedziela,
pełne tygodnie miesiąca. Reguły i odbiór bez zmian.

- `actions.lod`, akcja 52: `ActionBtn0.tex`, row 6 / col 3. `UICharacterInfo.cpp`
  i `UICharacterInfoNew.cpp` otwierają dla niej CUICalendar. To oryginalny symbol
  kartki kalendarza z czerwonym grzbietem.
- `calendar.xml`, `CalendarUi.tex`: pola daty (878/439, 92×66), zaznaczenie
  (786/440, 90×64), pola dni tygodnia i nagłówek. Eksport `calendar-art.mjs`.
- Zakładki z `skill_new`, pasek postępu z Book, ramka okna, sloty oraz przycisk
  odbioru z istniejących grafik klienta. Pasek czasu jest na górze. Siatki mieszczą
  się w widoku bez przewijania; na niskich ekranach w poziomie sterowanie jest
  w lewej kolumnie, a dni po prawej.
- `event-button.mjs` usuwa stary symbol ze środka EventBtn0 przed nałożeniem
  nowego, zachowuje proporcje obrazu. Ten sam helper poprawia ikonę Statui.

## Zapis i serwis, przekazanie dla Claude

SaveVersion **17**, migracja 16→17 zachowuje całe konto, Cash, rezerwację Statui,
Dungeons i World Boss. Nowe opcjonalne `SaveData.loginCalendar` przechowuje `day`,
`onlineMs` i `claimedDays`. Sanitizer weryfikuje daty i zakresy. Cofnięcie daty nie
resetuje stanu ani nie umożliwia odbioru poprzedniego dnia.

`CalendarRuntime` raportuje widoczność i heartbeat co 5 s. Serwis sam mierzy czas
przez `now()`, bez mnożnika walki i bez parametru z klienta określającego czas.
Pierwszy raport po load tylko rozpoczyna interwał. Przerwa ponad 15 s nie jest
zaliczana jako online. Interwał przez północ liczy wyłącznie fragment nowego dnia.
`calendarClock` jest ulotny i zeruje się po load, zmianie postaci oraz resecie.

`claimLoginCalendar` rozlicza też końcówkę bieżącego interwału, sprawdza 600000 ms,
sprawdza wspólną datę odbioru i zapisuje flagę oraz oba przedmioty razem.
Konflikt zapisu cofa pamięć serwisu. Powtórka, reload i zmiana postaci nie płacą
ponownie. BagFeed emituje nagrody po udanym zapisie. `calendarMarkedAt` w store
służy tylko do płynnego licznika w GUI, nigdy do przyznawania nagród.

## Weryfikacja

`npm run check`: **634 testy / 79 plików**, lint, formatowanie i TypeScript.
`npm run build`: poprawny. Nowe testy sprawdzają pełny próg 600000 ms na
kontrolowanym zegarze (w tym ostatnią milisekundę), brak czasu offline/tła/DEV,
reload częściowego czasu, wspólny limit postaci, północ UTC, cofnięcie daty,
konflikt równoległego odbioru i migrację konta v16 z rezerwacją Moonstone.

Chromium na buildzie produkcyjnym: 320/390/1280 px, brak poziomego przepełnienia,
tydzień i miesiąc, wybór dat, czytelne ilości, timer i przycisk odbioru. Ukrycie
symulowane przez visibilitychange zatrzymuje czas, powrót wznawia, reload zachowuje
postęp. Próbę odbioru rozpoczęto z zapisanymi 9 min 30 s; końcówka upłynęła na
działającej aplikacji. Wypłata obu prezentów raz, oba widoki oznaczone, zmiana
postaci i reload nie pozwalają odebrać ponownie. Bez błędów JS, konsoli i HTTP.

Sprawdzono też Statuę bez dodatkowej ramki/X, przyznanie po animacji i Exit,
nowy Cash Ticket (zużycie sztuki, +100 Cash) oraz Good ×5 / Perfect ×3 w inventory
i tabeli łupów Balroga. Ostatnia próba używała DEV charge/Kill target, bez pomiaru
balansu. Wagi akcesoriów wszystkich czterech bossów sprawdzają testy źródłowe.

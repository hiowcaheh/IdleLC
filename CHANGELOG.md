# Historia zmian

## 2026-11-11 (Codex): skończone pule Laca Ball i Auto Draw

1. Poszerzone okno i większy obszar maszyny, węższa tabela nagród po prawej.
   Usunięty Exit, poprawiony X z grafiki klienta, dostępny również podczas gry.
2. Płynniejsza, szybsza animacja: 2 s ręcznie, 1 s w Auto Draw ×2. Wynik znika
   po 1,5 s, po czym automat może kontynuować. Zamknięcie i ukrycie karty
   zatrzymują automat; przerwana runda zachowuje wynik i pobraną opłatę.
3. Procentowe szanse zastąpione rzeczywistymi licznikami pozostałych nagród.
   Właściwy system z `t_lcball` i kodu SubHelper: pięć kursów dla Tokena i pięć
   dla Gold Tokena, po pięć nagród. Jeden żeton na losowanie. Wiersz głównej
   nagrody ma `1/1`; jego wygranie uzupełnia cały wybrany kurs. Pozostałe kursy
   zachowują stan. Nowa tabela pokazuje też ilość przedmiotów w wygranej.

SaveVersion **19**, z zachowaniem opłaconych losowań v18 i pozostałych postępów.
Pule są wspólne dla postaci lokalnego konta; pula wszystkich graczy wymaga
współdzielonego backendu. [Źródła i przekazanie dla Claude](docs/lacaball.md).
Weryfikacja: **654 testy / 82 pliki**, check i build. Chromium: sześć rozmiarów
okna, pięć widocznych nagród, reset puli, Auto ×2, wynik po około 1,5 s,
X/Resume/reload, ukrycie karty oraz migracja opłaconego losowania v18.

## 2026-11-11 (Codex): Laca Ball, złote niedziele i Moonstone Auto ×2

1. Niedziela w Weekly zajmuje cały dolny rząd i ma złote wyróżnienie. Każda
   niedziela w obu kalendarzach daje po jednym 500 Cash Ticket, łącznie dwa
   bilety o wartości 1000 Cash. Wymagane 10 minut online i jeden odbiór na konto.
2. Ta sama ikona kalendarza jest teraz na lewo od Dungeons, w trzeciej kolumnie.
   Pod Moonstone pojawił się przycisk Laca Ball.
3. Laca Ball ma trzy kursy, źródłowe koszty i wagi, GUI maszyny z klienta,
   potrząsanie kulami, wypadanie i otwieranie kapsuły. Nagrody dobrane do IdleLC;
   lista pokazuje ilości i szanse. Rezerwacja wyniku pozwala wznowić grę po
   zamknięciu lub reloadzie bez drugiej opłaty i ponownego losowania.
4. Każdy potwór ma niezależne 1% na Token, także na AFK, ekspedycji, w Dungeons
   i jako World Boss, bez wpływu poziomu i bonusów do dropu. Gold token dostępny
   wyłącznie w ItemShop; przyszły drop tego żetonu z Perfect Moonstone zmieniony
   na zwykły Token z zachowaniem wagi i ilości.
5. ItemShop: Token ×100 za 1000 Cash, Gold token ×50 za 750 Cash.
6. Napis losowania i wygranej na Statui obniżony do środka tabliczki. Auto ×2
   skraca obrót do 1,5 s i przerwę do 350 ms; wypłata zachowuje zgodność z animacją.

SaveVersion **18**, migracja dotychczasowego postępu.
[Źródła, nagrody i przekazanie dla Claude](docs/lacaball.md).
Weryfikacja: **649 testów / 81 plików**, lint, formatowanie, TypeScript i build.
Chromium produkcyjny: kalendarze w siedmiu rozmiarach bez przewijania, przebieg
i wznowienie Laca Ball, oba zakupy żetonów. Próba niedzieli potwierdziła dwa
bilety, 1000 Cash po użyciu i zachowany odbiór po reloadzie.

## 2026-11-11 (Codex): kompaktowy kalendarz i sam panel Moonstone

1. Pasek czasu online jest na górze kalendarza. Weekly i Monthly mieszczą się w
   widoku bez przewijania, również na telefonie i w poziomie.
2. Kliknięcie daty lub przycisku dzisiejszych prezentów otwiera modal z pełnymi
   nazwami i ilościami. Odbiór obu nagród odbywa się w tym oknie; Return wraca do
   kalendarza. Odebrany dzień zostaje oznaczony w obu zakładkach.
3. W Moonstone całkowicie usunięto dolny box z opisami i wynikiem. Checkbox Auto
   jest wewnątrz GUI po prawej u góry, a wynik i stan losowania w oryginalnym polu
   tytułu Statui.

SaveVersion nadal **17**. [Notatka dla Claude](docs/login-calendar.md).
Weryfikacja: **634 testy / 79 plików**, check i build. Chromium produkcyjny:
Weekly i Monthly bez przewijania w siedmiu rozmiarach od 320×568 do 1280×900,
w tym 568×320 w poziomie; podgląd, Return, jednorazowy odbiór i fokus modali.
Statua: Auto, Stop, Exit i wypłata po zatrzymaniu paska.

## 2026-11-10 (Codex): kalendarz nagród i poprawki Moonstone

1. Każdy World Boss gwarantuje dodatkowo 5 Good Moonstone i 3 Perfect Moonstone.
2. Poprawiona ikona Statui: jeden symbol, zachowane proporcje. Okno pokazuje sam
   oryginalny panel z opisami, bez dodatkowej ramki oraz przycisku X.
3. Cash Ticket otrzymał wyraźną pomarańczową ikonę biletu z klienta.
4. Nowy przycisk kalendarza pod Moonstone. Zakładki Weekly i Monthly pokazują
   wszystkie nagrody, odebrane dni i podgląd wybranego prezentu.
5. Po 10 minutach online jeden odbiór przyznaje razem dzisiejszy prezent tygodniowy
   i miesięczny. Limit wspólny dla konta, reset o 00:00 UTC. Czas sumuje się i
   przetrwa reload; tło, offline i przyspieszenie DEV nie nabijają licznika.

SaveVersion **17**, migracja starszych zapisów bez utraty postępu.
[Notatka dla Claude](docs/login-calendar.md).
Weryfikacja: **634 testy / 79 plików**, pełne check i build. Chromium
320/390/1280 px: nowe GUI, licznik, brak czasu w tle, wspólny odbiór i reload.
Produkcja: użycie biletu Cash oraz dodatkowe kamienie w łupach Balroga (DEV).

## 2026-11-10 (Codex): Statua, poziome losowanie i odsłonięcie nagrody na końcu

1. Ikona skrótu przedstawia twarz Statui z oryginalnego klienta w jednej ramce.
2. Nagrody jadą od prawej do lewej i zwalniają do przedmiotu pod środkowym
   znacznikiem. Nazwa, dodanie do ekwipunku i powiadomienie po lewej pojawiają się
   dopiero po zatrzymaniu paska.
3. Stop wyłącza automat po bieżącej rundzie, Exit czeka na jej wynik. Przerwane
   losowanie jest zapisane; po ukryciu karty lub reloadzie Resume dokańcza ten sam
   wynik bez drugiego kamienia. Automat nie działa w tle.

Źródłowe nagrody i szanse bez zmian. Nadal SaveVersion **16**.
[Szczegóły i notatka dla Claude](docs/moonstone-cash.md).
Weryfikacja: **623 testy / 77 plików**, lint, formatowanie, TypeScript i build.
Chromium 320/390/1280 px; kierunek, środkowy wynik i powiadomienie po końcu
animacji. Build produkcyjny: automat, Stop/Exit połączone z ukryciem karty,
ponowne otwarcie i reload tej samej rundy, bez ponownego zużycia kamienia ani
podwójnej nagrody.

## 2026-11-10 (Codex): drop World Bossów, bilety Cash i Statua Księżycowa

1. Nowy gwarantowany drop bossów: Platinum Small Healing/Mana Potion po 50,
   Lucky Scroll 10, Moonstone Box 25 i jeden 100 Cash Ticket. Usunięto Scroll of
   Memorizing, Crystal of Experience i Tool Aid. Raid ACC zachowują źródłowe szanse.
2. Bilety 10/20/50/100/500/1000 Cash: złota ikona biletu z klienta, Use w ekwipunku
   zużywa sztukę i doładowuje wspólny portfel Item Shop jednym zapisem.
3. Moonstone Box: źródłowe 52% Poor, 30% Average, 15% Moon Stone, 3% Good.
   Open, Multi-open, podgląd zawartości i wynik także po zużyciu ostatniej skrzynki.
4. Statua Księżycowa pod Item Shop, z oryginalnym GUI MoonStone.tex i pięcioma
   przyciskami kamieni. Pełna tabela nagród serwera, oryginalne ilości i poziomy
   mineralów, zachowywane oddzielnie w ekwipunku i po reloadzie. Przycisk jest
   ukryty podczas World Bossa, aby nie nachodził na stoper na wąskim ekranie.
5. Start/Stop, Exit i checkbox automatu. Automat kończy się po wyczerpaniu kamieni,
   zamknięciu okna lub ukryciu karty. Nagrody pojawiają się po lewej jak zakupy.

Nadal SaveVersion **16**. [Źródła i przekazanie dla Claude](docs/moonstone-cash.md).
Weryfikacja: **619 testów / 77 plików**, lint, formatowanie, TypeScript i build.
Chromium produkcyjny 320/390/1280 px: automat na 100 kamieni, Stop/Exit/ukrycie
karty, sześć nominałów Cash, otwarcie całego stosu skrzynek i reload salda/nagród.
Balrog w buildzie produkcyjnym dał poprawny nowy drop; zdobyty bilet doładował
portfel o 100 Cash. Próby na przygotowanych zapisach, walka przy ×20.

## 2026-11-10 (Codex): World Boss na bieżącym spocie, kamera i Book

1. Przycisk bossa podniesiony o 48 px względem środka ekranu, bez powiększania ikony.
2. Boss pojawia się na aktualnym spocie. Przywołanie i wznowienie zwykłego polowania
   nie uruchamiają podróży na inny plac walki.
3. Kamera mieści wysokie i latające modele oraz bohatera pod HUD. Pasek HP śledzi
   źródłową kość głowy i zachowuje czytelną szerokość. Mgła i zasłaniające wysokie
   dekoracje uwzględniają dalszą kamerę podczas próby.
4. Stoper i okno łupów mają więcej oryginalnych ramek klienta: portret, panel,
   nagłówek tabeli, sloty przedmiotów i pola ilości.
5. Na końcu listy każdej mapy w Monster Book jest jej World Boss. Progi i nagrody
   są takie jak u pozostałych potworów: 10/100/1000/10000 zabójstw, 1/2/5/10 Heaven Stone.

SaveVersion nadal **16**, źródłowe statystyki i szanse dropu bez zmian.
[Opis dla Claude](docs/world-boss.md). Weryfikacja: **605 testów / 73 pliki**, lint,
formatowanie, TypeScript i build. Chromium 320/390/1280 px: ten sam spot,
oba smoki, modal oraz jednorazowe odebranie nagrody Book dla czterech bossów.
Próby na przygotowanych zapisach z DEV, bez pomiaru balansu.

## 2026-11-10 (Codex): World Boss, stoper i okno łupów

1. Portret i półokrąg przycisku zmniejszone o połowę (portret 32 px), po lewej na
   środku wysokości ekranu. Tekst licznika zachowuje czytelny rozmiar.
2. DEV: `Fill World Boss charge` napełnia licznik bieżącej mapy bez dodawania zabójstw.
3. Po pokonaniu bossa gra zatrzymuje się i pokazuje modal klienta z tabelą EXP, SP,
   złota oraz wszystkich przedmiotów i ilości. `Continue` rozpoczyna powrót na spot.
   Reload przywraca okno; nagrody są zapisane raz, zamknięcie nie wypłaca ich ponownie.
4. Stoper `MM:SS` na górze pośrodku startuje przy pierwszym ataku, ofensywnym skillu
   lub ataku summona. Bieg, pojawianie się i podejście nie są wliczane. Czas zapisany
   w milisekundach przy każdej próbie, z wynikiem, mapą i NPC, pod przyszły ranking.
   Próby z napełnieniem DEV, zmianą tempa lub narzędziami walki DEV mają znacznik testu.

Nadal SaveVersion **16**, bez zmian źródłowych statystyk i dropów. Dokumentacja i
przekazanie: [docs/world-boss.md](docs/world-boss.md).

Weryfikacja: 600 testów / 72 pliki, Chromium 320/390/1280 px; stoper, pauza klatek,
tabela nagród, reload i wznowienie bez ponownej wypłaty.

## 2026-11-10 (Codex): World Boss

Szczegóły źródeł i notatka dla Claude: [docs/world-boss.md](docs/world-boss.md).
SaveVersion nadal **16**, istniejące zmiany Claude do `f5b95b9` zachowane.

1. Ikona bossa po lewej w idle, półokrąg postępu od lewej do prawej, poświata przy
   gotowości. Osobny licznik dla postaci i mapy: Juno 2000, Dratan 1800, Merac 1600,
   Egeha 1500. AFK, wyprawy i Dungeons nie naliczają zabójstw.
2. Grand Balrog 308, Grand Devilroad Kamira 307, Grand Red Dragon 309 i Grand Golden
   Dragon 331. Przywołanie usuwa zwykły cel, postać biegnie trasą mapy do bossa.
3. Osobna źródłowa tabela `t_npc_dropraid`: dziewięć gwarantowanych pozycji oraz
   dziesięć niezależnych losowań raid ACC (1% / 1,8% / 1,4% / 2% na każde).
   Drop przedmiotów nie zależy od poziomu postaci ani buffów do dropu.
4. Raid ACC są nieodkryte, używają lup, źródłowych opcji i kolorów. Crest of Rainbow
   ma źródłowe grade B, pozostałe grade A. Naszyjniki poprawnie zajmują slot akcesorium.
5. Jedna próba i jedna wypłata. Po śmierci, wyjściu lub reloadzie próba kończy się
   bez zwrotu licznika; postać wraca na poprzedni spot. Po wygranej otrzymuje drop
   i też wraca. Zwykła walka nie odradza kolejnego bossa.
6. Oryginalne modele Kamiry i obu smoków, portrety z modeli klienta, ikony nowych
   przedmiotów oraz źródłowy efekt umiejętności Kamiry. Bez dodatkowej sceny 3D w HUD.

Weryfikacja: 596 testów / 72 pliki, build, Chromium 320/390/1280 px, przywołania i
powroty na czterech mapach, śmierć, odkrywanie raid ACC. Próby walk na przygotowanych
zapisach z narzędziami dev; szczegóły i granice testów w dokumentacji powyżej.

## 2026-11-07 (Claude Code): piąta partia (buffy konia, sklep, poświata skrzynki)

Szczegóły: [docs/owner-batch-2026-11-07.md](docs/owner-batch-2026-11-07.md), sekcja „Piąta
partia”. 581 testów / 70 plików. SaveVersion nadal 16.

1. Offensive i Defensive Howling konia (poziom 12) zamiast pasywnych umiejętności zwierzaka; Moon
   Cake i Stars zamiast moich dwóch propozycji.
2. Sklep na częściach `Cashshop.tex`:
   - karty równej wielkości;
   - pasek Cash z przyciskiem Top up (okno z informacjami: 1 € = 1 000 Cash, PayPal, Discord);
   - zakładka SALE;
   - tabela zawartości paczek.
3. Nowe, tanie ceny bez pay2win (bez kamieni i sprzętu), paczki 30–41% taniej.
4. Zakupy pokazują się po lewej jak drop.
5. Okno buffa mikstury pokazuje działanie i opis (Berserker, kradzież HP/MP).
6. Złota poświata, słup światła i iskry pod skrzynką.

## 2026-11-07 (Claude Code): czwarta partia (skrzynki, sklep Cash, mikstury, buffy)

Szczegóły, ceny, pytania i lista zmian w plikach Codexa:
[docs/owner-batch-2026-11-07.md](docs/owner-batch-2026-11-07.md). SaveVersion nadal 16.
580 testów / 70 plików.

1. **Przycisk Dungeons** jako kwadrat zdarzeń klienta, bez podpisu i poświaty.
2. **Mikstury w drodze:** auto-picie HP/MP także w biegu między spotami.
3. **Suwaki z GUI klienta** (`NewOption.tex`).
4. **Mikstury w torbie posortowane:** boosty, HP, MP.
5. **Bez skracania drogi:** zamknięcie gry w biegu przywraca spot startowy (`runFrom`).
6. **Pięć buffów podziemi:** Ignition 2, koń atak 30, koń obrona 30, Mount HP/MP 10,
   Dragon magia 30.
7. **Animacja biegu w rundzie** przy strzelaniu.
8. **Skrzynki podziemi:** 5% z potwora, model 3D z klienta na podłodze, otwieranie w torbie.
9. **Nowe mikstury z bazy** z regułami serwera (steal, berserker, atrybuty, tarcze, krytyk,
   EXP/SP).
10. **Sklep za Cash:** zakładki HOT, Items, Potions, Packages, grafiki z `Cashshop.tex`.

## 2026-11-07 (Claude Code): efekty skilli z klienta, etap 2 (modele, pociski, smugi, orbity)

Commity `3eac61a`, `b71a8f8`, `7d8998d`. 565 testów / 66 plików.

1. **Modele MDL w efektach (EFMD, 220 użyć).** Nowy czytnik `scripts/lc/mdl.mjs` (MDAT
   V002–V010, według `CModelData::Read_t`) czyta wszystkie 15 modeli efektów: płaszczyzny,
   billboardy, cylindry, krąg magii i lejki huraganu. Runtime w `modelEffect.ts` przenosi
   `CMdlEffect` i `CEffectControl`: kolor, alfę, mruganie, wygaszanie, skalę, pozycję po
   splajnie i kąt. `ModelMeshes.ts` rysuje je z mieszaniem add / alpha, billboardami
   i overdraw.
2. **Modele SKA w efektach (EFSK, 79 użyć).** 31 modeli `.smc` jako GLB (`public/fx/client/ska`,
   1,5 MB), tym samym konwerterem co postacie i skrzydła. Pierwsza animacja gra w pętli,
   z kolorem i skalą efektu.
3. **Pociski.** Trzy efekty wystrzału ze `skills.lod` mają swoje role:
   - FireEffect1 gra przy rzucającym;
   - FireEffect2 to pocisk, który leci z dłoni do celu z prędkością skilla, przy każdym opóźnieniu;
   - FireEffect3 to trafienie, gdy pocisk doleci.

   Grupa przygotowania kończy się przy wystrzale, a kula Energy Bolt rusza z miejsca, w którym
   się uformowała (MT_CONTINUE). Pociski i grupy przygotowania nie wiszą już 10–20 s.

4. **Smugi (EFSB 33, EFTC 7) i orbity (EFOB 23).** `trail.ts` to wstęga przez próbki z ostatnich
   `traceTime` sekund. Przy jednym punkcie jest zwrócona do kamery, przy grupie (miecz, sztylety)
   rozpina się między dwoma punktami. `orbit.ts` przenosi ruch `COrbitEffect`: efekty-dzieci
   krążą po sinusach, z wygaszaniem promienia i fazy oraz drogą do tagu celu.
5. **Przybliżenia własne** (brak danych w konwertowanych modelach):
   - punkty grup broni (SWORD, sztylety, AXE) to końce trzymanej broni wzdłuż najdłuższej osi;
   - drugi punkt pocisku jest 0,8 m za nim.

**Jeszcze nie:** dźwięki (EFSN 123), światło (EFLT), teren (EFTR), fala uderzeniowa (SWVE),
efekty encji (EENT), trzypunktowe smugi EFTC. Efekty tytułów i ulepszeń mają nadal własne
adaptery Codexa.

## 2026-11-07 (Claude Code): trzecia partia, 16 zgłoszeń (Buffs, rankingi, runda)

Szczegóły i lista zmian w plikach Codexa: [docs/owner-batch-2026-11-06.md](docs/owner-batch-2026-11-06.md),
sekcja „Trzecia partia”. Commity `cf933d4`, `8c7a334`. SaveVersion nadal 16.

1. **Buffs** (dawniej Buffer):
   - nowe karty z efektami „teraz → po ulepszeniu”;
   - koszt 100 / 200 / 300 … za poziom;
   - Haste i Battle Roar zastąpione przez Mana Recovery i Tyrant (Haste 2 i Battle Roar 2 zostają);
   - kupione poziomy usuniętych buffów wracają jednorazowo jako punkty.
2. **Rankingi:** zakładka pokazanego podziemia i zakładka wszystkich podziemi, po trzy miejsca.
3. **Runda:**
   - nick i tytuł nad bohaterem jak na polu;
   - napisy paska poziomu mieszczą się w ramce;
   - po wyczyszczeniu fali zawsze mija pełne 5 s;
   - okno wyboru błogosławieństwa mówi „Game paused” i podaje czas do następnej fali.
4. **Mikstury w rundzie:**
   - torba zostaje otwarta po wypiciu;
   - toast zmian statystyk jak na polu;
   - slot pokazuje czas działania i odnowienie;
   - nazwa mikstury nad bohaterem zawsze widoczna.
5. **Ikona torby:** Old Pouch, przedmiot z gry (wypada z Harpy Queen w Dratan).
6. **Przycisk Dungeons:** większy, ze złotą poświatą i podpisem.
7. **Limit biegu 20 m/s:** „Movement bonus” w Character pokazuje premię po limicie.

## 2026-11-06 (Claude Code): efekty skilli prosto z klienta (etap 1: cząsteczki)

1. **Eksport z klienta.** `scripts/lc/client-effects.mjs --client <klient 2015>` zapisuje
   `public/fx/client/effects.json` i 165 tekstur WebP (`public/fx/client/tex/`). W eksporcie są
   wszystkie grupy efektów, których używają skille klas i potworów (skills.lod: ready / fire /
   after oraz efekty z kluczy klipów w `.bae`): 287 grup, 960 efektów i 464 systemy cząsteczek.
2. **Port silnika cząsteczek klienta** (`src/scene/clientFx/particles.ts`, krok po kroku według
   `CParticle*.cpp`):
   - emitery: kula, stożek i walec;
   - procesy: dynamic state, force, point goal, control i velocity;
   - pochłanianie z typami ruchu i tablica losowa klienta.
3. **Odtwarzacz i rysowanie.**
   - `player.ts`: grupy efektów z czasami i tagami.
   - `ParticleMeshes.ts`: quady zwrócone do kamery albo smugi, komórki tekstury, tryby mieszania
     klienta 203/205/206/208.
   - Tagi postaci (CENTER, RHAND, broń…) bierze ze źródłowych tagów Codexa (`placeSourceTag`).
4. **Gdzie działa.**
   - Na polu walki i w Dungeons, dla skilli bohatera i potworów.
   - Skille z cząsteczkami z klienta nie używają już własnych efektów `SkillEffects`.
   - TEST-HIT = środek celu. ARROWHEAD leci od dłoni do celu przez czas wystrzału.

**Jeszcze nie:** modele MDL (plany, pierścienie: 219 użyć, 15 plików), modele SKA efektów (78),
dźwięki, smugi broni (trace), orbity. Kolejne etapy są w `docs/development-handoff.md`.

## 2026-11-06 (Codex): mniejsza minimapa na dole Dungeons

Minimapa zmniejszona z 90 do 72 px i przeniesiona na dół po lewej, nad paskiem
umiejętności. Górny panel informacji wypełnia zwolnione miejsce i ma mniejsze
odstępy oraz niższy pasek EXP. Zachowuje ramki klienta i wszystkie dotychczasowe informacje.
Weryfikacja: 549 testów, build i próby produkcyjne 320/390/1280 px, także z marginesami ekranu.

## 2026-11-06 (Codex): komunikat po wyczyszczeniu fali

Po przeglądzie notatek i zmian Claude’a do `d688757` uzupełniono brakujący napis
„Wave cleaned” i małe odliczanie do następnej fali, maks. 5 s, w ramce klienta.
Licznik korzysta z istniejącego czasu rundy i respektuje pauzę. Zachowano gotowy
układ statusu obok minimapy oraz logikę fal Claude’a. Seraphim i skrzydła pozostają.
Szczegóły: [docs/dungeons.md](docs/dungeons.md).
Weryfikacja: 549 testów / 62 pliki, build, Chromium 320/390/1280 px i rzeczywiste
wyczyszczenie pierwszej fali w buildzie produkcyjnym. Brak błędów JS/konsoli/HTTP.

## 2026-11-06 (Claude Code): druga partia, 15 zgłoszeń (Dungeons i HUD)

Szczegóły i lista zmian w plikach Codexa: [docs/owner-batch-2026-11-06.md](docs/owner-batch-2026-11-06.md),
sekcja „Druga partia”. SaveVersion nadal 16.

1. **Fale:** dwa razy więcej potworów na falę. Następna fala przychodzi 5 s po wyczyszczeniu
   poprzedniej, najpóźniej po 30 s. Po fali 20 ostatnia powtarza się do końca.
2. **Mikstury w rundzie:** dotknięcie slotu HP/MP pije, przytrzymanie otwiera ustawienia.
   Nazwa wypitej mikstury unosi się nad bohaterem.
3. **Okno Dungeons:**
   - napisy „Ranking” i „Monsters level”;
   - top 3 z trofeum klienta w złocie, srebrze i brązie;
   - pełne grafiki Belfist i Procyon z nazwą pod obrazkiem.
4. **Runda:**
   - status obok minimapy;
   - licznik kryształów po prawej stronie paska;
   - sakiewka jako ikona torby;
   - wybór błogosławieństw przewijany w bok ze strzałką.
5. **HUD:**
   - pasek buffów tak szeroki jak ramka gracza;
   - przycisk Dungeons obok Settings;
   - łupy listowane jeden pod drugim.
6. **Narzędzia dev:** reset dzisiejszych wejść do podziemi.

**Dla Codexa:** zmienione `dungeons.ts` (fale, `nextWaveIn`), `Dungeons.tsx`, `dungeons.css`,
`DungeonScene.tsx`, `DungeonLoot.tsx` i `dungeon-art.mjs`. Doszedł też nowy `ScrollStrip.tsx`.
Pełna lista jest w dokumencie partii.

## 2026-11-06 (Claude Code): 12 zgłoszeń właściciela, uwagi dla Codexa

Szczegóły: [docs/owner-batch-2026-11-06.md](docs/owner-batch-2026-11-06.md). SaveVersion nadal 16.

1. Wyprawa liczy aktywne mikstury i buffy przez czas ich działania; okno wyprawy
   i podsumowanie powrotu pokazują je.
2. Super Haste blokuje Potion of Haste, jak `CanApply` serwera.
3. Łupy po zabiciu wychodzą po lewej. Sloty mikstur są po prawej nad paskiem skilli.
4. Suwak progu AUTO (5–100%) pod przełącznikiem slotu. Okno przedmiotu i torba Dungeons
   zamykają się po wypiciu.
5. Book bez żywiołów. Przycisk Dungeons to znak podziemi z mapy klienta w ramce
   szybkiego menu.
6. Buffy w jednej przewijanej linii, maks. 50, ze strzałkami klienta, także w Dungeons.
7. Bohater biega maks. 20 m/s wszędzie.
8. Nowy wygląd okna Dungeons i okna wyniku rundy (tylko GUI).

**Dla Codexa:** zmiany w `Dungeons.tsx`, `dungeons.css`, `DungeonLoot.tsx`, `dungeon-art.mjs`,
`ui.mjs`, `MonsterBookPanel.tsx` i `menu-dungeons.webp`. Reguły rundy, punktów, Buffera
i zapisu zostały bez zmian. Pełna lista klas i powodów jest w sekcji
„Dla Codexa” w [dokumencie partii](docs/owner-batch-2026-11-06.md).
Dzięki za Dungeons!

## 2026-11-06 (Codex): bonusy i skrzydła Seraphim

1. Na życzenie właściciela artefakt daje +1200% EXP/SP, +800% złota, +300% szansy
   dropu oraz po +1200 STR/DEX/INT/CON. Bonusy są widoczne w wyborze superbuffa.
2. Duże, oryginalne animowane skrzydła Angel_wing03, dwa modele i sześć warstw
   podpiętych do postaci. Animacja zatrzymuje się w pauzie; efekt znika po rundzie.

Szczegóły źródeł i zakresu konwersji: [docs/dungeons.md](docs/dungeons.md).
Weryfikacja: 533 testy / 61 plików, build, sześć klas w Chromium i pełna runda
produkcyjna na ekranie 320 px. Brak błędów JS/konsoli/HTTP.

## 2026-11-06 (Codex): superbuffy i oryginalny czas mikstur w Dungeons

1. Mikstury z ekwipunku zachowują źródłowy czas i pozostały efekt po rundzie/reload.
   SF_ABSTIME zachowuje termin końcowy, SF_NOCANCEL działa przy śmierci. Darmowe
   wybory podziemia są ograniczone do rundy i nie zapisują się jako własne mikstury.
2. Specjalne wybory na poziomach 5/10/15/20: Platinum Blessed Iris (3× EXP), Platinum
   Super Skill Pill (3× SP), Blue cube effect oraz najwyższy źródłowy Seraphim.
   Stałe wartości z bazy/serwera, bez ulepszania punktami i bez powtórek.
3. Symetryczne bitmapowe strzałki Quest.tex, brak licznika 1/3, więcej ramek klienta.
4. Atlasy ikon otrzymują wersję zależną od zawartości, zgodną z indeksami nowego eksportu.

SaveVersion pozostaje 16. Weryfikacja: 528 testów / 59 plików i próby przeglądarkowe.
Szczegóły wartości, różnicy Archangel/Seraphim i testów: [docs/dungeons.md](docs/dungeons.md).

## 2026-11-06 (Codex): interfejs Dungeons, minimapa i Buffer

SaveVersion **16**, migracja v15 zachowuje postępy. Szczegóły: [docs/dungeons.md](docs/dungeons.md).

1. Q po prawej, grafiki podziemi z klienta, zakładki Dungeons / Buffer i więcej oryginalnych ramek.
2. W rundzie tylko Opcje i torba w prawym menu. Podgląd aktualnych łupów z EXP/SP/złotem,
   minimapa z graczem, mobami i kryształami, szersza belka pod buffami, joystick na środku u dołu.
3. Pause na górze, Return / Leave oraz dwa potwierdzenia wyjścia.
4. Buffy od poziomu 1, trwałe ulepszenia w Bufferze za punkty, osobno dla każdej postaci.
   Saldo do wydania i łączny wynik rankingowy są niezależne; zakupy nie obniżają rankingu.
   Domyślnie 100 punktów/poziom; punkty równe zabójstwom po pełnej rundzie.
5. Monster Book: Worlds / Dungeons, 23 NPC z adnotacją podziemia, te same progi i nagrody.

Weryfikacja: 523 testy / 59 plików, TypeScript, lint, format, próby Chromium 320/390/1280 px.

## 2026-11-06 (Codex): Dungeons, trzy podziemia i aktywna walka z hordą

Po przeglądzie zmian Claude’a do `9ad20b8` i pełnej bazy z 2016. Opis i źródła:
[docs/dungeons.md](docs/dungeons.md). SaveVersion **15**, migracja v14 zachowuje postępy.

1. Belfist Temple (wejście od 1), Procyon Shrine (15), Maargadum (30), osobne okno
   wyboru ze strzałkami, oryginalne Q po lewej oraz miejsce pod ranking i lokalny rekord.
2. Runda 10 aktywnych minut, 20 fal, joystick/WASD, automatyczne ataki i skille,
   oryginalne 23 NPC / 20 modeli, nagrody według dotychczasowych reguł źródłowych.
3. Kryształy i poziom podziemia 1–20. Awans zatrzymuje grę do wyboru jednego z trzech
   buffów sześciu klas, także zaawansowanych. Wybrany buff nie wraca do puli; efekty
   znikają po zakończeniu. Obszary skilli mają źródłowe zasięgi, kąty i limity celów.
4. Dwa wejścia dziennie na podziemie **na postać**, reset UTC. Śmierć kończy rundę
   i zachowuje zdobyte EXP/SP/złoto/przedmioty, zgodnie z odpowiedzią właściciela.
   Ekwipunek jest zablokowany także w serwisie, mikstury i skille działają.
5. Checkpointy i jednokrotne nagrody. Reload przerywa podejście, zachowując nagrody
   i wykorzystane wejście. Ukryta karta, wybór buffa i pauza zatrzymują czas.

Weryfikacja: `npm run check` (518 testów / 59 plików), build i pełne rundy w Chromium
na ekranach 320, 390 i 1280 px. Areny hordowe używają zasobów oryginału; szczegóły
świadomych reguł tego nowego trybu i ograniczenia testów zapisano w dokumentacji.

## 2026-11-06 (Claude Code): walka z serwera, brakujące skille, żywiołaki Sorcerera

Punkt wyjścia `445f599`. Commity `1cc02e0`, `6555b24`, `bfe732d`, `9708ca3`, `87cfbbf`, `d2ad688`,
`dd3564a`, `576f8c0`. Pełny opis: [docs/combat-skills-summons.md](docs/combat-skills-summons.md).

1. **Szybkie poprawki**: bez poświaty slotów mikstur, Equipment z listą „Worn”, 100 Cooldown
   Reduction Potion = skille od razu gotowe (własna reguła), 100% Cast Potion wycofana (zwrot
   50 000 złota za sztukę), Remove effect z potwierdzeniem i czerwonym komunikatem spadków.
2. **Walka jak na serwerze**: ciosy i tempo potworów (`GetDamage` NPC), kara za śmierć w walce
   i na wyprawie, koszt skilla przy wystrzale, żywioły (`nAttrTbl`).
3. **Skille**: Far Seeing, Combat Reflection, Charge, Veteran's Composure działają; Resurrection
   i Invisibility mają w oknie Skills powód, dla którego nie działają solo.
4. **Żywiołaki Sorcerera**: statystyki z `Elemental.cpp`, 20 min, przerwa 5 s, pary ogień/wiatr
   kontra ziemia/woda, nienawiść potwora i prowokacja, pasywne „Empowered” tylko na żywiołaka;
   modele klienta w scenie.
5. **Wydajność**: teren czyta tylko warstwy, które są widoczne w danym miejscu (ten sam obraz),
   Settings → Performance info pokazuje FPS i obciążenie sceny do pomiaru na telefonie.

Weryfikacja: `npm run check` (**496 testów / 57 plików**), Chromium 390×844. SaveVersion **14**.

## 2026-11-05 wieczór (Claude Code): 15 zgłoszeń — tytuły 1:1, bieg, GUI, teren, dym

Punkt wyjścia `b1bbc0e`. Commity `4069ec7`, `d6a791a`, `abf96ad`, `baffd2a`, `c446eb9`, `2ebf847`,
`76cf06f`. Pełny opis: [docs/owner-batch-2026-11-05-evening.md](docs/owner-batch-2026-11-05-evening.md).

1. **Opcje tytułów i specjalne według serwera**: 342 → 855 Critical rating jest poprawne (+150%),
   poprawiony opis; 24/25 bez efektu; tytuł: 50 bez efektu, 99 tylko wyświetlane; 101–106 działają.
   Ciosy potworów mają źródłowe typy (krytyk tylko u bossów), co pozwala działać Toughness.
2. **Bieg**: licznik czasu, wyprawa zablokowana w biegu (a gdyby ruszyła, to ze spotu startowego),
   nowa mapa zawsze od pierwszego spotu.
3. **Teren**: maski warstw wszystkich map naprawione (kreski i kwadraty na ziemi), `MAP_REVISION`.
4. **Mikstury**: Super Haste (1 h), własna 100% Cast Potion, Adrenalina wszędzie; okno mikstury
   w wierszach; dym pod stopami przy wzmocnieniu biegu jak w kliencie; Remove effect dla buffów.
5. **GUI**: porównanie „If you wear it” zielone/czerwone z Wear pod spodem, Settings bez nadmiaru
   linii, slot mikstury tylko z AUTO, Equipment wtopione w okno, efekty na ekranie wyboru postaci.

Weryfikacja: `npm run check` (**464 testy / 53 pliki**), Chromium 390×844. SaveVersion **14**.

## 2026-11-05 (Claude Code): spawny i trasy, walka z dystansu, wzmocnienia, partia GUI

Punkt wyjścia `0be9812`. Commity `63377de`, `9dd82c1`, `3a29b80`, `bf73c70`, `4ab0d3a`, `67671a3`.
Pełny opis: [docs/spawns-routes-ranged-boosts.md](docs/spawns-routes-ranged-boosts.md).

1. **Zrzut bazy 2016 — wszystkie 4 etapy** (decyzja właściciela): `lc-data.json` z pełnego importu
   (spawny, `hitrate`, drop według 20 slotów ~4–5× rzadszy, CON/magic avoid/ataki i skille NPC).
2. **Dratan, Merac, Egeha**: walka w punkcie spawnu potwora z `t_npc_regen`; Juno bez zmian.
3. **Bieg między spotami** trwa tyle, ile trasa po mapie przy Run speed (A* po `nav.bin` z pliku
   atrybutów klienta albo nachylenia/obiektów/rzeki); trasa omija wodę, drzewa, skały i urwiska.
4. **Walka z dystansu**: Healer (20 m), Mage (15 m), Rogue z kuszą (15 m) strzelają od razu, potwór
   dobiega z prędkością z bazy; zasięgi z kodu serwera (+2 m dla broni dystansowych/magicznych od +8).
5. **GUI**: jeden X w Skills, pole AUTO i podświetlenie mikstury w slocie, Settings na elementach
   okna opcji klienta, loader stref w proporcjach obrazka, mała wspólna ramka złota, Gold na całą
   szerokość w Expedition, „Loading IdleLC”.
6. **Mikstury**: Potion of Haste, Platinum Adrenaline i 100 Cooldown Reduction Potion z efektami,
   czasem i flagami z bazy; stan zapisywany (`boosts`). W bazie nie ma mikstury szybkości rzucania.
7. **Komunikaty** po zakładaniu/zdejmowaniu, ulepszaniu, tytułach i miksturach pokazują zmiany
   statystyk na zielono/czerwono.

Weryfikacja: `npm run check` (**453 testy / 52 pliki**), Chromium 390×844. SaveVersion **14**.

## 2026-11-05 (Claude Code): sześć poprawek GUI i sprawdzenie zrzutu bazy 2016

Punkt wyjścia `fd6e1ee`. Commity `45eb188`, `da0ebd7` oraz dokumentacja.

1. **Book:** próg zabójstw, nagrody i Claim w jednym wierszu (kolumny Kills / Rewards / Status),
   mniejszy Claim; nic na siebie nie nachodzi.
2. **Inventory:** wszystkie sześć zakładek klienta w jednej linii także na telefonie (mniejsze rogi
   grafiki i tekst; od 600 px poprzedni rozmiar).
3. **Character:** pasek EXP w nagłówku nie ma już jaśniejszego prostokąta — wycinek `book-progress`
   gubi półprzezroczystą obwódkę z atlasu (`ui.mjs`, opcja `minAlpha`), adres z `?v=` dla cache PWA.
4. **Character → Equipment:** usunięty napis „Tap a piece to see it”; plansza sprzętu zajmuje pełną
   wewnętrzną szerokość okna i jest niżej (ta sama grafika i ikony, bez dodatkowego skalowania ikon).
   Komunikat o pustym slocie zostaje, gdy gracz go wybierze.
5. **Skills:** pasywny skill do nauczenia ma ten sam zielony kolor i poświatę co aktywny (okrągły
   pierścień nad ikoną, więc szary filtr nienauczonego skilla go nie przygasza).
6. **Expedition:** okno w ramce klienta (pasek tytułu, X), sekcje jak w Character, pola wartości
   (Kills, Deaths, EXP, SP, Gold na godzinę), lista mikstur z ikonami (slot, ilość w torbie, zużycie
   na godzinę, na jak długo starczy / AUTO off / brak w torbie) oraz przyciski klienta Cancel i Send.

**Zrzut bazy 2016** (Drive właściciela): to ten sam `newproject_data.sql`, z którego zrobiono pierwszy
import — tylko starszy importer pomijał część kolumn. Zawiera `t_npc_regen` (spawny pasują 1:1 do
terenu Dratan, Merac i Egeha; Juno nie), `hitrate` skilli oraz CON/hit/dodge/magic avoid, 20 slotów
dropu i skille potworów. **Nie zaimportowano go do gry**: pełny import zmienia balans (łupy ok. 4–5×
rzadziej, część potworów wyraźnie groźniejsza). Pomiary i proponowane etapy:
[docs/db-2016-dump.md](docs/db-2016-dump.md).

Weryfikacja: `npm run check` (**435 testów / 49 plików**), zrzuty Chromium 390×844 każdego okna.
SaveVersion **14**, bez zmian zapisu i reguł gry.

## 2026-11-05: płynne podbieganie do kolejnego potwora

- Pozycja i obrót postaci podczas podbiegania aktualizują się w każdej klatce.
  Wcześniej oba elementy przeskakiwały w krokach logiki co 50 ms.
- Rysowanie pozycji uwzględnia niewykorzystany ułamek czasu; logika walki,
  czas dojścia zależny od Run speed i oryginalne tempo klipu biegu są zachowane.
- Uwzględniono stun, stone, hold, ukrytą kartę i zaległy czas symulacji.
- Zbadano ruch sześciu klas i oddzielnie pełną scenę produkcyjną.

[Pomiary i walidacja](docs/approach-motion-fix.md). SaveVersion **14**.

## 2026-11-05: bieganie, zakładki Inventory i przyciski

[Zakres, pomiary i ograniczenia](docs/running-inventory-fixes.md).

- Otoczenie mapy korzysta z indeksu przestrzennego i aktualizuje tylko zmienione
  modele oraz używane fragmenty buforów. Zachowano zasięg, obiekty i ich kolejność.
- W próbach Juno/Merac ilość danych buforów na odświeżenie spadła o 93–97%.
  To pomiar obciążenia renderera, bez deklarowania wzrostu FPS na telefonie.
- Inventory ma oryginalne grafiki zakładek: dwa rzędy na telefonie, jeden na desktopie.
- Przyciski zakupu, sprzedaży i nauki skilli pokazują tekst oraz koszt bez kropki.
- Sprawdzono pliki spawnów: dokładne współrzędne wymagają brakującej tabeli
  `t_npc_regen`. Rozmieszczenie potworów pozostaje bez zmian do otrzymania danych.

SaveVersion **14**, bez zmiany mechaniki, szybkości biegu i zapisu postaci.

## 2026-11-04: loader, Merac i osiem zgłoszeń GUI

Punkt wyjścia `c744b39`. [Zakres i sprawdzenia](docs/ui-merac-fixes.md).

- Merac zachowuje oryginalny teren, obiekty i 23 spoty z poprzedniej aktualizacji.
- Loader wypełnia cały ekran całą ilustracją, bez przycinania, przybliżania
  ani rozmytych marginesów; proporcje obrazu dostosowują się do ekranu.
- Nagrody Book mają oddzielny wiersz z ikonami i ilościami oraz mniejszy Claim.
- Character używa tego samego oryginalnego paska postępu co Monster Book.
- Zielona ramka aktywnych i pasywnych skilli pojawia się tylko przy możliwości nauki.
- „How speeds work” jest po prawej i otwiera osobne okno z GUI klienta.
- SP pozostaje widoczne jako liczba, bez ikon w Character i Skills.
- Usunięto długie myślniki z opisów, etykiet dostępności i metadanych aplikacji.

SaveVersion **14**, bez przeliczania postaci i przedmiotów.

## 2026-11-04 — naprawy po audycie: zapis, czas, walka, AFK i mapy

Punkt wyjścia `a35cfbb`. [Stan wszystkich 14 punktów, źródła i ograniczenia](docs/audit-fixes.md).

- Jedna aktywna karta i odrzucanie starego zapisu; druga karta wznawia aktualne konto.
- Stałe kroki logiki z zachowaniem czasu przy niskim FPS, bez automatycznych nagród z tła.
- Źródłowe HP/MP i wspólne kanały arkusza/walki; INT laski i DEX łuku mają właściwy wpływ.
- AFK symuluje skończone mikstury i ważność tytułu w czasie zabójstw.
- Rozdzielone stany, DOT pozostawiający 1 HP, MP_CANCEL Tyranta i Cure Poison.
- Źródłowe attack speed, cooldown bez limitu 50% i naturalna regeneracja co 3 s.
- Merac i Egeha mają oryginalne tereny oraz otoczenie WLD.
- Wszystkie okna utrzymują fokus klawiatury i oddają go po zamknięciu.
- Importer zachowuje brakujące wcześniej pola; dodano ścisły odzysk profili FX.
  Nie są to odzyskane dane SQL ani ukończony renderer. Nauka niekompletnych skilli
  jest blokowana, bez kasowania zapisanych poziomów. Summony, pełne FX oraz część
  hit/drop/Deadly pozostają do ukończenia; raport wymienia je jawnie.

SaveVersion **14**. Wyniki sprawdzeń: [plik walidacji](docs/audit-fixes-validation.json).

## 2026-11-04 — osiem poprawek Book, postaci, skilli i sklepu

Punkt wyjścia: `b0f10ab`. [Zakres i walidacja](docs/book-shop-ui-fixes.md).

1. Lista potworów i informacje w Book przewijają się niezależnie, również
   dotykiem nad podglądem 3D. Licznik jest na pasku postępu, prezenty są mniejsze.
2. Pola sum atrybutów są równe i symetrycznie ustawione; plusy pozostają obok.
3. Character i Skills mają wspólną pełną ikonę SP bez rozciągania grafiki.
4. Bieżący i następny poziom w modalu skilla mają odstępy od obu krawędzi.
5. `Mastered` jest pod nazwą w liście i w nagłówku szczegółów, bez powtórki na dole.
6. Usunięto dwie ciemne kreski z dolnej części ramki Book.
7. Ilość posiadanego złota w Shop ma oryginalną ramkę pola wartości.
8. Sklep oferuje najlepsze dostępne źródłowe warianty rare w tej samej rodzinie,
   cenie i poziomie. Po odkryciu można uzyskać niebieską klasę A i sześć opcji,
   m.in. casting/unik na hełmie, silence/stone na klatce i spodniach, bieg na butach,
   zgodnie z pulą przedmiotu. Oferta pokazuje liczbę pieczęci i możliwą klasę.
   Wynik nadal jest losowy; posiadane sztuki nie są zmieniane.

Weryfikacja: **389 testów / 43 pliki**, lint, formatowanie, TypeScript i build.
Chromium: trzy rozmiary okna, niezależny scroll myszy i dotyku, audyt 687 wpisów
progów oraz 39 zakupów/identyfikacji w serwisie na rzeczywistych danych LC.
Pełny build: zakup i odkrycie sprzętu przez GUI oraz zapis po odświeżeniu przeszły.
SaveVersion pozostaje **14**.

## 2026-11-04 — poziomy potworów, losowe nagrody i Dratan

Punkt wyjścia: `bf61f0f`. [Reguły, źródła i walidacja](docs/pve-dratan-fixes.md).

1. Całe nazwy potworów mają źródłowe kolory i progi różnicy poziomu: czerwony,
   żółty, biały, zielony, niebieski. Kary EXP/SP, blokada przedmiotów od przewagi
   6 poziomów i malejąca szansa złota działają w serwisie, aktywnej walce i AFK.
   Zachowano źródłowe minimum EXP/SP; niebieskie potwory nadal dają 10% bazowego EXP.
2. Mist i Poison Mist oraz ich elitarne warianty zachowują miękką przezroczystość,
   źródłową alfę i Full Bright. Przeliczono oba modele; szare prostokąty nie są
   rysowane jako nieprzezroczyste powierzchnie. Naprawiono też nazwę drugiego ataku.
3. Dratan ma oryginalny teren 3072×3072 m, 11 warstw, obiekty z WLD i 42 miejsca
   walki. Konwersję można odtwarzać osobno przez `--only terrain --map dratan`.
4. Każde zabójstwo niezależnie losuje EXP/SP ±10%, szansę złota i jego ilość
   50–150% bazy. Awans w środku rozliczenia zmienia następne nagrody. Estymacje
   pokazują wartości oczekiwane, Book podpisuje bazy, a feed zachowuje precyzję SP.

Weryfikacja: **385 testów / 43 pliki**, lint, formatowanie, TypeScript, build
i weryfikator zasobów przeszły. Chromium: osiem widoków sceny, osiem podglądów Book,
pięć kolorów, tryb z cieniami i przejście mapy — bez błędów strony, konsoli i zasobów.
180 raportów na rzeczywistych danych LC potwierdziło losowanie, kary i zapis.
Kaflowanie terenu zmniejszyło rysowany kadr z ok. 534 tys. do 40–67 tys. trójkątów.

## 2026-11-03 — źródłowe premie ulepszeń i dopracowanie GUI (17 zgłoszeń)

Punkt wyjścia: `fa66c0e`. [Wzory, zasoby i walidacja](docs/client-ui-upgrade-fixes.md).

1. Ulepszenia ATK/DEF używają źródłowej potęgi 1,06 do +10 i 1,07 powyżej +10,
   obcięcia części ułamkowej oraz płaskich premii progowych, w tym +15.
   Szanse, kamienie, wymiana, porażki i limit +15 pozostają takie jak dotąd.
2. Walk speed jest ukryte w Character; źródłowe pole pozostaje w obliczeniach.
3. Gotową nagrodę Book oznacza oryginalny prezent z Cashshop zamiast „!”.
4. Book ma źródłowe ramki, zakładki, listy, papier nagród i pasek postępu.
5. Usunięto powtórzony poziom spod ikon skilli; poziom jest w opisie obok.
6. Ikony pasywne są faktycznie okrągłe, łącznie z przycięciem samego obrazka.
7. Kliknięcie umiejętności otwiera osobny modal w ramce klienta.
8. Character ma źródłowe zakładki, nagłówki sekcji i ikonę SP.
9. Plusy atrybutów są mniejsze, z atlasu klienta, i znajdują się poza polem sumy.
10. Attack interval pokazuje końcowy odstęp i zmianę z jednostką „s”. Cast time
    adjustment i Cooldown adjustment zastępują niejasne „Normal” / „reuse time”.
    Dodano rozwijane objaśnienia sekund i procentów; modal pokazuje bieżące czasy
    skilla, z wartością bazową, gdy bonusy je zmieniają.
11. Appraiser korzysta ze źródłowych zakładek i formatowania wierszy klienta.
12. Shop korzysta z tych samych zakładek oraz uporządkowanych nagłówków i list.
13. Goods są grupowane po działaniu i rosnącej mocy: HP, MP, regeneracja HP/MP,
    kamienie i lupy. Great Mana Potion jest bezpośrednio po Medium Mana Potion.
14. Settings ma ramkę NewOption, sekcje, źródłowe przyciski wyboru i prostsze kontrolki.
15. Cała ilustracja ładowania mieści się przez `contain`, bez zoomu i przycinania.
    Osobne rozmyte tło wypełnia przestrzeń na pionowym ekranie.
16. Pod statystykami przedmiotu +15 są osobne źródłowe podpisy, np.
    `Attack Power +75`, `Defense power +100`, `Magic Defense power +50`.
17. Modal skilla zawiera źródłowy opis, typ i cel, wymagania poziomu/SP/sprzętu
    i wcześniejszych skilli, bieżący oraz następny poziom, efekty, koszt HP/MP,
    czas przygotowania, odnowienia i trwania oraz akcje nauki/AUTO/paska.

Weryfikacja: `npm run check` (**350 testów / 40 plików**), build i weryfikator
odzyskanych zasobów przeszły. Produkcyjny build sprawdzono w Chromium przy
320×740, 390×844 i 1280×900, wraz z dwoma przejściami map. Brak błędów strony,
konsoli i żądań zasobów; bez poziomego przepełnienia okien.

## 2026-11-03 — ekspedycje, rozwój postaci i GUI (18 zgłoszeń)

Punkt wyjścia: `58f51ae`. Szczegóły zasad, źródeł i walidacji:
[raport wdrożenia](docs/fixes-2026-11-03.md).

1. Ekspedycja nalicza czas od pierwszej pełnej sekundy. Podgląd zabić, EXP i złota
   nie czeka na upływ minuty; powrót przed minutą również rozlicza polowanie.
2. Ceny lup w Appraiser są w osobnym wierszu pod szansą działania.
3. Przyciski okna zakupu znajdują się przy dolnej krawędzi, poniżej podsumowania.
4. Wszystkie kwoty i ceny, także komunikaty sprzedaży, używają ikony złota.
5. Kolory kwot są zgodne z progami klienta: biały / cyjan / zielony / żółty / złoty.
6. Appraiser ma zaznaczanie wszystkich odkrytych przedmiotów i potwierdzenie przed
   sprzedażą; anulowanie zachowuje zaznaczenie oraz przedmioty.
7. W oknie Titles nickname jest nad tytułem; oba mają źródłowe ramki NamePopup.
8. Kolejna kraina wymaga zabicia ostatniego potwora poprzedniej: Juno → Dratan →
   Merac → Egeha. Warunek sprawdzają GUI, store i serwis.
9. Lista potworów w Book oznacza gotową do odebrania nagrodę znakiem „!”.
10. Podglądy potworów i postaci mają wspólne oryginalne tło przymierzalni Cashshop.
11. Skills korzysta z odzyskanej ramki, tła, zakładek, pola SP oraz osobnych opraw
    aktywnych/pasywnych umiejętności z `skill_new.tex`.
12. Opcja za czas gry trafia wyłącznie na zwykłą broń/zbroję poniżej poziomu 73.
    Akcesoria i wszystkie przedmioty rare są wyłączone z tego mechanizmu.
13. Attributes ma plusy i licznik pozostałych punktów. Każdy awans daje 1 punkt,
    także na wyprawie. Rozdanie zmienia bieżące statystyki i zapisuje się trwale.
    Migracja 13 → 14 zachowuje postępy; dotychczasowe poziomy dają należną pulę.
14. Kamera zachowuje dystans przy zniknięciu potwora; zmiana rozmiaru celu nie
    uruchamia animowanego zoomu. Loader odsłania mapę po podróży i ustaleniu kadru.
15. Po wejściu na mapę jej nazwa pojawia się przez chwilę na górze ekranu.
16. Kolejność górnych ikon: Settings → Titles → Skills → Inventory → Character.
17. Rzeczywista prędkość biegu skraca podróż między spotami i dobieg do potwora.
18. Combat bonuses zawiera osobne Stun / Stone / Silence resistance, z opcji
    61 / 60 / 62 i źródłowym limitem 80%.

Weryfikacja: `npm run check` (**337 testów / 39 plików**), build i weryfikator
odzyskanych zasobów przeszły. Chromium: GUI mobilne/desktop, rzeczywiste modele
Book, cztery przejścia map, nazwy po wejściu i reduced motion — poprawne, bez błędów
strony, konsoli i zasobów. Migracja v13 i rozdawanie punktów mają osobne testy.

## Dalsza korekta po testach na telefonie

Punkt wyjścia: `729a8b8`. [Raport źródłowy i walidacja](docs/source-followup-fixes.md).

- Loader map ponownie wypełnia ekran przez `cover`, bez pionowych czarnych pasów
  i animowanego zoomu. Zachowano dekodowanie, pasek szerokości i reduced motion.
- Character ma oddzielone atrybuty, zasoby, walkę, bonusy, szybkości i regenerację.
  Dodano osobne źródłowe physical/magic attack, defense, hit i evasion,
  critical/deadly rating oraz run/walk m/s. Główne pola bojowe nadal mają adapter balansu.
- Pierścienie ulepszeń używają rzeczywistych tagów, poprawnych nazw kości GLTF i
  źródłowych macierzy BS; łuk ma pierścień przy dłoni, podwójne miecze przy obu.
  Nieznane tagi nie spadają już do podstawy postaci.
- Wróżka korzysta z `CENTER` i źródłowej ścieżki przy głowie/ramieniu; kadr podglądu
  obejmuje cały efekt także u wysokich klas.
- Tytuły `eff_name*`, w tym najwyższy poziom sześciu klas, mają trzy źródłowe warstwy
  dymu zamiast podłogowego pierścienia i gwiazd. Odzyskano 12 grup, 36 emiterów
  i pięć tekstur; osiem innych rodzin efektów pozostaje nieobsługiwanych.
- `npm run check`: **317 testów / 37 plików**; build i weryfikacja zasobów poprawne.
  Sprawdzono rzeczywiste pozycje efektów sześciu klas, wysoki łuk i dual swords,
  układ mobilny/desktop oraz 28 wariantów loadera i cztery przejścia produkcyjnego buildu.
  Końcowe testy przeglądarkowe bez błędów strony, konsoli i zasobów.

## 2026-11-02 — etap 4: statystyki, opcje i efekty ulepszenia

Partię odtworzono od `461e964` po utracie niewysłanych plików. Źródła i ograniczenia
zgodności, przykłady liczbowe oraz wyniki kontroli opisuje [raport poprawek](docs/fixes-2026-11-02.md).

- Hitrate i evasion są punktami, z bazami/przyrostami klas i dwoma niezależnymi
  losowaniami całkowitymi. Knight 20 ma 168 punktów, opcja +75 daje 243.
- Dodano cztery źródłowe atrybuty i współczynniki bonusów HP/MP, opcje 67–80 i AllStats 99.
  Sprzęt i tytuł są liczone razem, bez mnożenia ich procentów. Newbie daje właściwe
  +10% bazowych HP/MP klasy; wygasłe tytuły tracą premie także podczas bieżącej walki.
- Opcje EXP/SP 82/83 działają w aktywnych nagrodach, wyprawie i estymacji godzinowej.
  STAT22 zwiększa maxHP z osobnymi limitami 450 po zsumowaniu grup; STAT23 zmienia
  przygotowanie castu, STAT8 odnowienie. Opcja 63 dzieli zwykły cios przez dwa.
- Bonusy ruchu mnożą prędkość. Porównanie podwójnych mieczy odejmuje również tarczę;
  Expedition zwalnia stan `busy` także po błędzie.
- Efekty broni i czterech części pancerza mają osobne progi 4/6/8/10/12/15.
  Dodano importer 108 grup ulepszeń z `Effect.dat`, oryginalną wróżkę i pięć pierścieni,
  ścieżki i tagi dłoni. Poświata śledzi geometrię broni. Poprawiono jasność/alfa Add,
  odróżniono Translucent i zachowano dwustronne powierzchnie modeli.
- Przejścia czterech map dekodują obrazy przed animacją, pokazują je w całości przez
  `contain`, używają szerokości paska i respektują reduced motion.
- Główne HP/ATK/DEF, pojedynczy kanał ratingów, critical/deadly oraz część renderera FX
  nadal są adapterami. Nie dodano backendu ani migracji; SaveVersion pozostaje 13,
  a zasady ulepszania, sześć klas, cztery strefy i AFK są zachowane.

Weryfikacja tej partii: `npm run check` (**301 testów / 33 pliki**), build i weryfikator
odzyskanych zasobów przeszły. Chromium: 18 kombinacji klas/ulepszeń, 28 kontroli map,
cztery rzeczywiste przejścia oraz Character/Newbie na buildzie produkcyjnym — poprawne,
bez błędów strony, konsoli i zasobów. Szczegóły oraz ograniczenia w raporcie powyżej.

## 2026-11-02 — etap 1: odzyskane zasoby klienta

Punkt wyjścia: `c9944c9`. Partia pochodzi z jawnego archiwum klienta 2015; formaty potwierdzono
kodem klienta z listopada 2018. Surowe archiwa i źródła C++ pozostają poza repozytorium.
Pochodzenie oraz ograniczenia zgodności opisuje [audyt źródeł](docs/source-audit/README.md).

- Poprawiono MESH17: kolejność parametrów materiału, flagi i indeksy UV. Kolor materiału jest
  odczytywany z parametru koloru zamiast z flag shadera. Czytnik kontroluje granice danych.
- Poprawiono TEX: sekwencyjne nagłówki zamiast wyszukiwania FRMC w pikselach; DXT3 rozróżniane
  od DXT5; starsze piksele RGB5551/RGBA4444. Skan odczytał 12493 siatki MESH17 do EOF i 11798 tekstur.
- Dodano odtwarzalną partię `scripts/lc/batches/recovery-2015.json`, `--batch` i `--strict`.
  Wywołania tylko dla ikon/UI nie nadpisują już mapowania animacji skilli.
- Wygenerowano 283 modele sprzętu: 258 z właściwymi teksturami zamiast jednolitego koloru,
  19 oryginałów zamiast zastępstw oraz sześć rękawic Cube Explorer.
  `lc-gear.json` obejmuje wszystkie 1158 grup źródłowych bez zastępczych modeli.
- Dodano Elder Drake; przywrócono oryginalny Cursed Weaver (z mieczem) i Cursed Lich.
  Odczytywalne oryginały mają pierwszeństwo; dawne zamienniki pozostają awaryjne.
- Odświeżono sześć modeli klas z ich kanonicznymi animsetami. Zastąpiono heurystykę `skills.lod`
  pełnym czytnikiem 1787 rekordów z checksum i EOF; poprawiono m.in. fazy Mage.
  Manifest ma 75 dokładnych mapowań z 2015 i cztery zachowane starsze wpisy.
- Uzupełniono mapowania ikon do 2052/2052 przedmiotów i 119/119 umiejętności; pięć komórek
  źródłowych jest szarymi placeholderami, a nie odzyskanymi ilustracjami.
- Wycięto właściwą ikonę Titles z ActionBtn0 (akcja 49), ramki NamePopup oraz poprawne paski
  ładowania; wszystkie 33 wycinki GUI mieszczą się w atlasach. Zintegrowano ramki i paski w UI.
- Naprawiono cache PWA: kasowanie tylko cache IdleLC, oczekiwanie na zapis odświeżonej odpowiedzi,
  tolerowanie braku miejsca oraz zachowywanie starszych chunków w obrębie wersji cache.
  Cache podniesiono do `idlelc-v2`; zapisy postaci pozostają w localStorage.
- Dodano [przekazanie dla Claude Code](docs/development-handoff.md), szczegółowe raporty,
  [rejestr decyzji i 25 różnic do późniejszego uzgodnienia](docs/design-decisions.md),
  narzędzie `npm run verify-lc-recovery` i [wynik kontroli GLB](docs/source-audit/recovery-validation.json).
  Historyczny dziennik CLAUDE jest wyraźnie oddzielony od aktualnego stanu.

## 2026-11-02 — etap 2: spójność statystyk i pierwsza korekta z serwera

- `heroKey` uwzględnia ID przedmiotu, rare i opcje założonego sprzętu. Identyfikacja noszonej sztuki
  oraz nowa opcja odświeżają fightera i estymację AFK bez wymiany UID. Zwykły łup nie resetuje walki.
- MT_RECOVER rozróżnia stałą ilość HP/MP (ONLYPOWER) i procent aktualnego maksimum (RATE),
  zaokrąglany w dół i ograniczony pojemnością zasobu. ADDITION jest odrzucane, zgodnie z
  `GameServer/Skill.cpp:1840,1906`. Opisy UI pokazują prawidłowe jednostki.
  Wszystkie 27 takich efektów w aktualnym eksporcie jest stałe — ich wartości pozostają takie same.
- Nie zmieniono bezpiecznego ulepszania, limitu +15, automatycznych opcji, rzadkich zestawów,
  czterech stref, limitu 100 ani działania wypraw. Nie dodano backendu ani Supabase; saveVersion nadal 13.

## 2026-11-02 — etap 3: roślinność Juno bez wymiany istniejących zasobów

- Dodano `npm run recover-lc-props`: dołącza wyłącznie brakujące modele i instancje,
  korzystając z obecnych aren. Przed zapisem sprawdza zgodność wcześniejszych rozmieszczeń;
  ponowne uruchomienie jest no-op.
- Juno ma 56 zamiast 41 modeli props i 5151 zamiast 963 instancji (+4188). Plik GLB rośnie
  z 969508 do 1185424 bajtów. Dotychczasowe geometrie, indeksy, transformacje, materiały i obrazy
  są identyczne po odczycie wynikowego pliku. Teren, maski, wysokości i 38 aren pozostały bez zmian.
- Nie zastąpiono różniących się tekstur drzew/budynków wersjami z 2015. Koszt nowych propsów
  oszacowano maksymalnie na +15 draw calls i +23477 trójkątów w promieniu 120 m na arenę;
  nie jest to pomiar FPS fizycznego telefonu.

### Weryfikacja pakietu

- `npm run check`: lint, Prettier, TypeScript, **271 testów w 31 plikach** — poprawne.
- `npm run build` i `npm run verify-lc-recovery` — poprawne. Odczytano wszystkie 292 GLB,
  sprawdzono skończone wartości accessorów, kości sprzętu, komplet mapowań oraz hashe manifestów;
  zero zastępczych płaskich materiałów w odzyskanej partii.
- Chromium/WebGL2 na buildzie produkcyjnym: sześć klas z odzyskanymi rękawicami, dziewięć modeli
  z animacjami w viewerze, walka i utrwalenie zapisu; układ mobilny 390×844.
  Test viewer/sceny z nowymi propsami: zero błędów strony, konsoli i HTTP.
- PWA: po pobraniu zasobów wyłączono sieć i odświeżono stronę — gra uruchamia się z cache
  `idlelc-v2`, WebGL2 i zapis postaci pozostają poprawne; zero błędów strony i konsoli.
- Osobno sprawdzono trzech odzyskanych przeciwników w faktycznej walce, najgęstszą arenę
  roślinności oraz rozliczenie AFK 1 h; bez błędów strony, konsoli i HTTP.

### Pozostałe ograniczenia i następne etapy

`ti_skill_10` jest jedynym jawnym wyjątkiem partii ścisłej; używa zwykłego zamachu. Nie dodano
aliasu do podobnie nazwanego klipu. Starsze MESH11/16 (m.in. nieobecny już wcześniej `st_sheaf02`),
morph maps i proceduralne FXDT pozostają nieobsługiwane. Dokładny tint tła tytułu wymaga porównania.
Fonty bitmapowe i grafiki Cashshop/CostumeInventory nie zostały arbitralnie podstawione w całym UI.

`Effect.dat` jest dostępny i częściowo odczytany, ale pełny importer definicji i renderer FX pozostają
osobnym etapem. Własne efekty gry nadal są własne. Pełne przeniesienie statystyk, statusów, damage,
trafienia i dropu wymaga rozszerzenia modelu oraz brakujących pól SQL; nie zastępujemy ich domysłami.

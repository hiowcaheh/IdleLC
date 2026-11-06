# Dungeons: Belfist Temple, Procyon Shrine, Maargadum

Wdrożenie z 2026-11-06, po przeglądzie zmian Claude’a do `9ad20b8`. Aktualny SaveVersion **16**.
To nowy, aktywny tryb hordowy IdleLC. Nie zastępuje polowania na spotach ani wypraw AFK.

## Aktualny układ rundy: minimapa na dole (2026-11-06)

Po kolejnej prośbie właściciela minimapa jest mniejsza (72×72 zamiast 90×90 px)
i znajduje się na dole po lewej, nad paskiem umiejętności. Uwzględnia bezpieczny
obszar ekranu. Górny panel informacji zajmuje całą szerokość wcześniej dzieloną
z minimapą. Zmniejszono jego pionowe odstępy i wysokość paska EXP, zachowując nazwę,
czas rundy, falę, punkty, poziom i licznik kryształów oraz oryginalne ramki klienta.
Komunikat końca fali jest odpowiednio wyżej. Zapis i logika gry pozostają bez zmian.
Weryfikacja: 549 testów / 62 pliki i build. Chromium na buildzie produkcyjnym
320×740, 390×844 i 1280×900, także z symulowanymi marginesami 47/34 px:
panel 91 px wysokości, minimapa 72 px, brak kolizji z joystickiem, skillami i miksturami,
brak overflow oraz błędów JS/konsoli/HTTP. Sprawdzono aktualizację pozycji gracza
na minimapie i komunikat po rzeczywistym wyczyszczeniu pierwszej fali.

## Uzupełnienie po zmianach Claude’a: komunikat końca fali (2026-11-06)

Przejrzano obie partie opisane w [notatkach Claude’a](owner-batch-2026-11-06.md),
do `d688757`. Węższy status obok minimapy oraz pięciosekundowe oczekiwanie były
już gotowe. Zachowano ich układ i reguły, podobnie jak pozostałe zmiany Claude’a.

Uzupełniono jedynie brakujący komunikat „Wave cleaned” z małym „Next wave in N s”,
w ramce klienta pod górnym HUD-em. `waveStatus.ts` odczytuje istniejący stan rundy,
bez drugiego zegara lub zmiany sposobu wysyłania fal. Odliczanie ma maksymalnie 5 s,
uwzględnia wcześniejszą falę z harmonogramu 30 s i zatrzymuje się wraz z pauzą,
oknem buffa lub menu. Komunikat wymaga wyczerpanej kolejki i braku żywych NPC;
znika po nadejściu następnej fali. Nie obiecuje nowej fali po zakończeniu rundy.
Artefakt Seraphim i oryginalne skrzydła z wcześniejszego etapu pozostają zachowane.

Weryfikacja uzupełnienia: `npm run check` **549 testów / 62 pliki**, build poprawny.
Chromium 320/390/1280 px: status i minimapa w jednym rzędzie bez overflow, komunikat
pod nimi, odliczanie, pauza, wcześniejsza fala według harmonogramu i zniknięcie po
wyjściu. Przypadki brzegowe korzystały z kontrolowanego wyczyszczenia fali w serwisie.
W bieżącej wersji sprawdzono również wybór Seraphim i sześć widocznych warstw skrzydeł.
Osobno build produkcyjny 320×740, Belfist / Healer 80: normalne autoataki wyczyściły
pierwszych 10 NPC bez podmieniania stanu ani EXP; licznik pokazał 5/4/3/2/1,
przetrwał pauzę i zniknął wraz ze startem fali 2. Brak błędów JS/konsoli/HTTP.

## Superbuffy i oryginalne czasy mikstur (2026-11-06)

Poziomy 5 / 10 / 15 / 20 zastępują zwykły wybór wyborem superbuffa. Wybrane
błogosławieństwo nie wraca: liczba dostępnych superbuffów wynosi kolejno 4 / 3 / 2 / 1.
Pozostałe awanse nadal losują trzy klasyczne buffy. Poziom 20 oznacza maksymalnie
15 zwykłych i 4 specjalne wybory. Również po podniesieniu kilku poziomów jednym zbiorem
kryształów kolejka zachowuje właściwe progi. Wszystkie te wybory trwają do końca rundy.

| Efekt                     | Źródło                                                      | Stała moc                                                     |
| ------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Platinum Blessed Iris     | item 1416, skill 349/2, magic 365/1                         | +200% EXP, 3× łącznie                                         |
| Platinum Super Skill Pill | item 2453, skill 468/1, magic 516/2                         | +200% SP, 3× łącznie                                          |
| Blue cube effect          | skill 1075/1, magic 949/1, 940/2, 991/2                     | +200% Deadly, ataku fizycznego i magicznego                   |
| Artifact of Seraphim      | item 10953, ApplyArtifact owner + zmiana właściciela IdleLC | +1200 STR/DEX/INT/CON, +1200% EXP/SP, +800% złota, +300% drop |

W dostarczonym serwerze Archangel (10952) jest środkowym artefaktem; najwyższy to
Seraphim. Oryginalny serwer nie daje SP/drop; na wyraźne życzenie właściciela IdleLC
z 2026-11-06 dodano +1200% SP oraz +300% drop. Pozostałe wartości są źródłowe.
Zasoby artefaktu wynikają także z klasy: CON zwiększa HP,
INT i CON zwiększają MP według `levelup_hp` / `levelup_mp` z PC.cpp. Wykorzystano
istniejące tabele współczynników z attributes.ts. Działanie uwzględnia kolejność:
zasoby po pasywach i przed procentowymi buffami asyst.

W `Assist.cpp` Iris i pigułka SP mają specjalną interpretację; ich surowa magia
wygląda jak zwiększenie ataku, ale nie jest używana jako atak. Import zachowuje surowe
rekordy w sourceEffects i eksportuje właściwy bonus nagród. Kolejne bonusy nagród
mnożą dotychczasową wypłatę IdleLC: sam Seraphim daje 13× EXP/SP, 9× złota i 4×
szansę dropu. Z Iris daje 39× EXP, z pigułką 39× SP. Drop zwiększa prawdopodobieństwo,
nie liczbę sztuk; nadal są cztery próby z dwudziestu pozycji, w tym pustych.
Reguły różnicy poziomów pozostają wspólne z pozostałą grą.

Skrzydła Seraphim pochodzą z `Angel_wing03`, przypisanego itemowi 10953 w
`CItemEffect::AddRelicEffect` / `g_strRelicEffectName`. `npm run recover-artifact-fx --
--client <katalog>` odzyskuje sześć warstw EFSK z Effect.dat oraz konwertuje oryginalne
modele `angel_wing_03.smc` i `angel_wing_03_b.smc`, teksturę, szkielety i animacje.
Warstwy zachowują opóźnienia 0 / 0,4 / 0,7 s, alpha 255 / 50 / 20, źródłowy rozmiar,
pozycję i heading. Są podpięte do żywego tagu CENTER każdej z sześciu klas, zgodnie
z CSkaEffect, także w biegu i przy obrocie. DefaultShader przy alpha <255 przechodzi
z alpha test na blend; pozostawienie progu MASK wycięłoby półprzezroczyste warstwy.
Animacje zatrzymują się z pauzą. Wizualizacja wymaga aktywnego darmowego efektu
artefaktu i znika przy jego usunięciu, wygaśnięciu albo zakończeniu rundy.
To adapter oryginalnych animowanych skrzydeł, bez czterech dodatkowych legacy EFMD
oraz emitera EFPT tej grupy. Pełna definicja jedenastu elementów pozostaje w manifeście;
nie zastąpiono brakujących elementów przypadkowymi sprite’ami.

Superbuffy są osobnym eksportem `dungeonSuperBuffs` i nie mają ulepszeń w Bufferze.
ID wyborów są ujemne, aby nie kolidowały z listą klas. `ActiveEffect.dungeon` oznacza
darmowy wybór, wykluczany z zapisu własnych mikstur przez boostsOf.

Mikstury z plecaka mają swój czas z oryginału: np. Platinum Adrenaline 3600 s,
Potion of Haste 200 s. Nie są przycinane do 600 s ani do pozostałego czasu rundy.
Własny efekt i zużycie przedmiotu zapisują się razem; po wyjściu lub przerwaniu
zostaje niewykorzystany czas. Przy śmierci stosowana jest flaga SF_NOCANCEL.
Dla SF_ABSTIME zachowany jest pierwotny termin końcowy; pauza/okno odświeża tylko
mikstury absolutne, bez postępu walki, zegara rundy i losowań. Względne czasy
wstrzymują się wraz z grą. Wybrane darmowe buffy zawsze znikają po zakończeniu.

Nie ma nowego schematu zapisu postaci: nadal v16. `OwnedBoost` zawierał już remaining
oraz until. Nowa aktualizacja nie odzyskuje mikstur skasowanych przez poprzedni kod.

Strzałki karuzeli to oryginalne bitmapy Quest.tex z questView.xml: lewa UV
193,944,11,15, prawa 207,944,11,15. Symetryczna siatka ma kurczący się środkowy
obszar nazwy; usunięto licznik 1/3. Panel, wartości i opisy korzystają z ramek
QuestBook/NewCharacterInfo/skill_new. Atlasy ikon mają skrót zawartości w URL,
żeby nowe pozycje ikon nie łączyły się z poprzednim obrazem w cache PWA.

## Interfejs i Buffer, aktualizacja v16

- Q jest wyśrodkowane w przycisku w prawej kolumnie menu. Okno wyboru ma zakładki
  Dungeons / Buffer, źródłowe grafiki podziemi z `Data/Interface/Loading/D_01`, `D_02`,
  `D_03` zamiast podglądu NPC oraz ramki/przyciski/zakładki z istniejących atlasów klienta.
- Podczas rundy w prawej kolumnie zostają Opcje i torba. Torba pokazuje bieżące EXP,
  złoto, SP, przedmioty z nazwami i liczbami; otwarcie zatrzymuje czas. Nagrody są już
  zapisane, okno nie wypłaca ich ponownie. Każda kwota złota ma istniejący komponent Gold.
  Zakładka Potions pozwala nadal ręcznie wypijać posiadane mikstury, również wzmacniające,
  po ukryciu przycisku Inventory. Zachowuje normalne koszty i blokady serwisu.
- Pause na górze otwiera Return / Leave. Leave wymaga dwóch kolejnych potwierdzeń.
  Anulowanie wraca do pauzy. Joystick jest na środku u dołu; gałka używa ramki TopUI.
- Minimapka nad belką wyniku pokazuje faktyczne pozycje gracza, żywych NPC i kryształów,
  w tych samych współrzędnych i okręgu co arena. Belka ma pełną dostępną szerokość;
  nad nią pozostaje miejsce na dwa rzędy buffów (dłuższa lista przewija się).
- Monster Book ma Worlds / Dungeons, a w drugiej zakładce wszystkie 23 źródłowe NPC
  z podziałem na trzy podziemia i adnotacją Dungeon monster. Zabójstwa już trafiały do
  wspólnych statystyk. Progi 10 / 100 / 1000 / 10000 oraz nagrody pozostają identyczne.
- Każdy zwykły buff klasowy zaczyna na poziomie 1. Buffer kupuje kolejne poziomy osobno dla postaci,
  wspólnie dla trzech podziemi, do najwyższego istniejącego poziomu źródłowego. Pokazuje
  efekty obecnego i następnego poziomu. Poziomy są kopiowane na wejściu i nie można
  ich kupować w trakcie rundy. Wartości efektów nie są mnożone własnym wzorem.
- Domyślne własne reguły nowego systemu: pełne 600 sekund daje punkty równe wynikowi
  (1/zabójstwo), jeden zakup poziomu kosztuje 100 punktów. Rezygnacja, śmierć i reload
  zachowują łupy, ale nie dają punktów Buffera. Saldo `points` spada przy zakupie;
  `totalPoints` wyłącznie rośnie po ukończeniu. Lokalny ranking postaci używa totalPoints.
  To ustawienia tego nowego trybu, nie odtworzona mechanika waluty oryginalnego serwera.

Migracja v15 → v16 uzupełnia portfel i poziomy. Zakończone rundy zachowane w starej
historii dostają punkty raz; zachowane zostają limity, rekordy, przedmioty i postacie.
Po utworzeniu licznik całkowity jest niezależny od limitu 30 przechowywanych wyników.

## Ustalenia właściciela

| Podziemie      | Oryginalna strefa            | Poziom wejścia | Potwory w zrzucie |
| -------------- | ---------------------------- | -------------: | ----------------: |
| Belfist Temple | `t_npc_regen.a_zone_num = 1` |              1 |  7, poziomy 10–25 |
| Procyon Shrine | 3                            |             15 |  6, poziomy 17–29 |
| Maargadum      | 9                            |             30 | 10, poziomy 40–52 |

Nazwy pochodzą z `t_string` 343 / 345 / 1201. Poziomy wejścia są własną regułą
właściciela, nie poziomami najsłabszych potworów. Parametry NPC nie zostały obniżone
do progu wejścia. Pozostałe podziemia czekają na późniejszy etap.

Runda trwa 600 sekund aktywnej gry. Każde zabójstwo daje 1 punkt. Dwa wejścia na
każde podziemie dziennie liczymy **osobno dla każdej postaci**. Rezerwacja wejścia
następuje przy starcie; wyjście i odświeżenie go nie zwracają. Reset jest o 00:00 UTC.
Cofnięcie zegara lokalnego nie cofa ostatniego zapisanego dnia.

Właściciel potwierdził: **śmierć kończy rundę i zachowuje zdobyte nagrody**. Zachowane
zostają EXP, SP, złoto i przedmioty; śmierć trafia do statystyk. Kara za śmierć poza
podziemiem działa nadal według istniejących reguł serwera.

## Przebieg rundy

- Widok 3D z góry i zza postaci, joystick z przechwytywaniem wskaźnika oraz WASD/strzałki.
  Bieg korzysta z `runSpeed(effectiveStats(...))`. Tempo klipu biegu nie jest mnożone
  przez Run speed. Pozycje są interpolowane między krokami logiki 50 ms.
- Postać sama atakuje najbliższy cel w zasięgu. Trwające uderzenie/cast zachowuje cel.
  Potwory podążają za graczem, atakują i używają swoich źródłowych umiejętności.
  Używane są istniejące reguły trafień, obrażeń, żywiołów, zasobów, stanów i mikstur.
- Źródłowe obszary skilli: okrąg wokół gracza/celu, stożek 120 stopni i prostokąt szeroki
  na 1 m. Promień, zasięg broni i liczba celów pochodzą z danych skilla. MP/HP płacone
  są raz przy FIRE, nie osobno za każdego przeciwnika. Każdy cel ma osobne losowanie.
- Żywiołaki Sorcerera działają także tutaj. Lista nienawiści do gracza i żywiołaków
  należy do konkretnego NPC, nie do całej hordy.
- Po aktualizacji Claude’a z 2026-11-06 budżet fali to `2 × (4 + numer fali)`.
  Następna przychodzi 5 s po wyczyszczeniu poprzedniej, najpóźniej na istniejącym
  harmonogramie co 30 s. Fala 20 powtarza się do końca rundy. Odstęp spawnu 0,65 s,
  jednocześnie do 16 żywych NPC; kolejka zostaje zachowana, gdy pole jest pełne.
  Kolejne fale używają wyższych pozycji oryginalnego zestawu NPC.
- Z zabitego potwora zostaje kryształ o wartości 1. Dopiero podniesienie daje EXP
  podziemia. Kryształy w promieniu 4,5 m lecą do postaci, zbierane są w promieniu 1,4 m.
  Podziemie zaczyna od poziomu 1 i EXP 0; limit to 20. Próg następnego poziomu:
  `3 + floor((poziom - 1) * 1.25)`.
- Awans zatrzymuje czas, ruch, efekty i walkę. Poza progami superbuffów gracz wybiera jeden z trzech różnych
  buffów. Wybrane ID znika z puli do końca rundy; niewybrane może wrócić. Pula zawiera
  30 obsługiwanych buffów sześciu klas, także zaawansowanych, z rangą 1 lub rangą
  kupioną wcześniej w Bufferze. Nie wydajemy SP i nie uczymy tych skilli na stałe. Wybrane
  błogosławieństwa kumulują się w tym własnym trybie hordowym.
- Buff wyboru trwa do końca rundy. Wyjście, śmierć i przerwanie usuwają darmowe
  wybory podziemia. Własne mikstury zachowują źródłowy czas i flagi śmierci.
  Pasywne cechy postaci, noszony sprzęt i tytuł pozostają.
- Można używać mikstur, zmieniać ich sloty/AUTO, przełączać skille, uczyć dostępnych
  skilli i rozdawać punkty. Noszenie/zdejmowanie sprzętu, ulepszanie i identyfikacja
  są zablokowane w `GameService`, niezależnie od przycisków UI. Automatyczne opcje
  na noszonych częściach też nie są dodawane w czasie rundy.
- Nie można wejść podczas biegu między spotami ani przejść z podziemia na AFK,
  zmienić strefy lub postaci. To zapobiega wykorzystaniu wejścia do skrócenia trasy.

Pauza, okna interfejsu, wybór buffa, ładowanie zasobów i ukryta karta nie zużywają
czasu rundy. Gra nie nalicza podziemia offline. Odświeżenie zamyka zapisany checkpoint
jako `interrupted` i pokazuje podsumowanie.

## Dane i zasoby odniesienia

Pełny `newproject_data.sql` z lutego 2016: SHA-256
`0cae2afd637966dd365f22a2795ba5402c29061aa83d01b84e6a8f7ce031d85d`
([pochodzenie i zgoda na import](db-2016-dump.md)). Rozszerzenie importera dodaje
strefy 1/3/9 i ich 23 NPC. Porównanie z `9ad20b8`: **żaden wcześniejszy wiersz NPC
się nie zmienił**, podobnie 119 zwykłych skilli klas, progi EXP, opcje, tytuły
i referencje mocy sprzętu. Doszło 13 przedmiotów oraz 3 definicje skilli NPC.

`dungeonBuffs` to osobny eksport 49 definicji aktywnych klasowych z `t_skill` / `t_skilllevel`
i `t_magic` / `t_magiclevel`, również `a_job2 != 0` i powyżej 100. poziomu. Filtr gry
odrzuca efekty nieobsługiwane i szkodliwe. Zaawansowane skille nie zostały dodane
do zwykłej listy nauki. Ikony po dodaniu superbuffów: 2072/2072 przedmiotów i zwykłe/dodatkowe skille z atlasów.

Nagrody przechodzą przez tę samą `rewardKills` i `stowDrops`, co polowanie: osobne
losowania EXP/SP/złota, kary różnicy poziomów i cztery próby wśród 20 slotów dropu.
Nie ma gwarantowanego złota ani przedmiotu z każdego zabójstwa. EXP postaci otrzymuje
się za zabicie, EXP podziemia za zebranie kryształu. Zabójstwa są zapisywane w
`stats.kills` i `stats.monsterKills`.

Kod odniesienia:

- `S/GameServer/Skill.h`: STT_SELF_RANGE / TARGET_RANGE / TARGET_D120 / TARGET_RECT.
- `C/Engine/Network/CNetwork.cpp` `FindTargetsInRange`, `C/EntitiesMP/Player.cpp`
  (limit celów, odjęcie głównego celu); `S/GameServer/doFuncSkill.cpp:1945–2050`
  (kontrola obszaru i stosowanie efektu).
- `S/GameServer/Skill.cpp` `CSkillProto::GetFireRange`: zasięg zależny od typu broni.
- Dotychczasowy port walki, nagród i żywiołaków: [combat-skills-summons.md](combat-skills-summons.md).

Skonwertowano 20 oryginalnych modeli dla 23 NPC (współdzielone modele zombie/szkieletów).
`deadammorsoldier` nie ma opcjonalnego `idle02`, `deathknight` nie ma `idle_02` i `dam`.
Manifest zawiera dostępne animacje właściwych modeli; nie zastępujemy ich golemami.

Arena hordowa jest własnym układem, z oryginalnymi teksturami posadzki i ścian z
`Data/World/Dungeon1`, `Dungeon2`, `Dungeon3`. Nie jest konwersją całego planu wnętrz WLD.
Wycięcie Q: `UIRadar.cpp` `RADER_QUESTNPC`, `TopUI.tex [649,448,14,15]`, z ramką TopUI.
Ramki okien, przyciski, ikony i pasek postępu korzystają z istniejącego GUI klienta.
Nadal używamy dotychczasowego adaptera `SkillEffects`, nie pełnego renderera `Effect.dat`.

Powtórzenie importu (surowe materiały poza Git):

```sh
npm run import-lc-db -- --dump /sciezka/newproject_data.sql
npm run convert-lc -- --client '/sciezka/2015 client' --only icons
node scripts/lc/dungeon-art.mjs '/sciezka/2015 client'
```

Modele konwertuje się `convert-lc --only <lista modeli>` jak pozostałe NPC.

## Zapis i ranking

Stan żywej walki należy do `LocalGameService`; scena animuje otrzymane snapshoty.
Checkpoint zawiera wynik, czas, poziom i sumę już wypłaconych nagród. Zapis jest
atomowy z postępem postaci: po zabójstwie/miksturze/wyborze i co najwyżej po sekundzie
aktywnej gry. Zapis v14/v15 migruje do v16 bez utraty postaci, przedmiotów i postępów.
Zamknięcie rundy nie wypłaca nic drugi raz.

Przechowujemy do 30 wyników i najlepszy wynik jednego podejścia dla każdego podziemia.
Okno pokazuje osobisty rekord i lokalny ranking postaci według całkowitych punktów.
Backend, globalny ranking i jego weryfikacja pozostają na później.

## Weryfikacja pierwszego wdrożenia v15

- Testy używają prawdziwego eksportu bazy (osobny mock `lcSource`, zwykłe testy projektu
  nadal korzystają z danych zastępczych). Zestaw obejmuje roster/statystyki/drop, 19
  niepowtarzalnych wyborów, pauzę, obszary i pojedynczy koszt castu, nienawiść NPC,
  prędkość i granice ruchu, zegar 600 s, limit wejść, blokady serwisu, mikstury,
  migrację, odświeżenie i jednokrotność nagród. Każde z trzech podziemi jest
  symulowane do zakończenia lub śmierci na danych źródłowych.
- Chromium/WebGL2, 390×844: Belfist, 600 s aktywnego czasu, 274 pkt, poziom 20,
  19 wyborów; joystick, zamrożenie czasu, zablokowane zdejmowanie broni.
- Chromium/WebGL2, 1280×900: Procyon, 600 s, 194 pkt, poziom 17.
- Chromium/WebGL2, 320×740: Maargadum, 600 s, 41 pkt, poziom 7.
- Mikstura przez Inventory: liczba 2 → 1 w obu ostatnich przypadkach; brak błędów
  strony/konsoli/HTTP; brak poziomego overflow. Sprawdzone progi wejścia 15/30 oraz
  przerwanie przez reload z zachowaniem zużytego wejścia.
- Osobny przebieg **produkcyjnego buildu**, wyłącznie przez GUI: Belfist / Knight 20
  ze źródłowym sprzętem +15, 600 s. 1280 px: 252 pkt, 647 957 EXP, 9053 złota,
  45,6129 SP i 28 przedmiotów; 320 px: 246 pkt, 580 709 EXP, 9705 złota,
  43,15 SP i 20 przedmiotów. Sprzęt porównany z faktycznym stanem przy wejściu
  pozostał identyczny. W obu przypadkach drugie wejście i rezygnacja blokują
  trzecie. Okno wyboru ma 900 px, wybór buffa 860 px na komputerze, bez
  przyciętych kart; na telefonie karty są w jednej kolumnie.

Rundy przeglądarkowe przyspieszano istniejącym trybem deweloperskim. Były to jawne
postacie testowe, z odpowiednim źródłowym sprzętem +15; nie pomiar balansu postaci
startowej. Renderowanie w headless Chromium/SwiftShader nie zastępuje pomiaru FPS
na fizycznym telefonie.

## Weryfikacja aktualizacji v16

- `npm run check`: 523 testy / 59 plików, lint, format i TypeScript.
- Chromium/WebGL2: 320×740, 390×844, 1280×900. Q po prawej, nowe grafiki, Buffer,
  zakup poziomu 1 → 2 za 100 punktów bez obniżenia totalPoints, wszystkie trzy listy
  NPC w Book i odbiór nagrody za 10 zabójstw, torba, zatrzymanie czasu, dwa
  potwierdzenia Leave, centralny joystick i zmiana pozycji znacznika minimapy.
  Brak błędów JS/konsoli/HTTP i poziomego overflow.
- Belfist / Knight 20, sprzęt źródłowy +15, 320 px: 600 sekund, 161 zabójstw,
  poziom podziemia 15, 240 359 EXP, 4243 złota, 21,506 SP i 8 przedmiotów.
  Po wcześniejszym zakupie saldo 0 → 161, lifetime ranking 100 → 261.
- Testy logiki obejmują źródłowe rangi 1/2, brak zmiany poziomu podczas aktywnej rundy,
  brak podwójnego zaliczenia, zachowanie sumy po wypadnięciu starych wyników z historii,
  limity poziomów i środków, osobne postacie, reload i migrację v15 bez ponownej zapłaty.
- Osobny test produkcyjnego buildu przez GUI, 320/1280 px: poziom 2 → 3 za 100 punktów,
  saldo 161 → 61, ranking stale 261. Reload zachowuje poziom i oba liczniki. Sprawdzone
  blokowanie zmiany postaci w Opcjach oraz brak kolizji Pause z ramką gracza.
- Produkcyjna torba Potions: Potion of Haste 2 → 1 i aktywny efekt po wypiciu,
  bez spadku punktów i bez zmiany sprzętu. Zweryfikowane wszystkie trzy grafiki
  karuzeli z klienta, w rozmiarach 320/1280 px, bez błędów strony i zasobów.

## Weryfikacja mocy i skrzydeł Seraphim

- `npm run check`: 533 testy / 61 plików, lint, format i TypeScript. Build poprawny.
- Wypłaty testowane osobno dla artefaktu i łącznie z Iris/pigułką: 13× lub 39×
  EXP/SP, 9× gold. Test dropu sprawdza próg 4×, puste pozycje, cztery próby i brak
  mnożenia sztuk. Źródłowe współczynniki HP/MP oraz atrybuty pozostają sprawdzone.
- Testy GLB sprawdzają hashe, animacje, szkielety, materiały i skończone wartości.
  Testy tagów wykorzystują prawdziwe, animowane modele GLTF wszystkich sześciu klas.
- Chromium 390/1280 px: wybór artefaktu przez GUI po kontrolowanym awansie serwisu,
  sześć klas, tag CENTER, warstwy/alpha, bieg, obrót, pauza i usunięcie po wyjściu.
  Te próby nie mierzą czasu zdobywania poziomów. Brak błędów JS/konsoli/HTTP/zasobów.
- Build produkcyjny, 320×740, Belfist / Healer 80 ze źródłowym sprzętem +15:
  pełne 600 s, 147 zabójstw, poziom podziemia 14. Sterowanie WASD według minimapy,
  przyspieszenie deweloperskie ×20, bez dodawania EXP/kryształów w trakcie.
  Seraphim wybrany na 5, Cube na 10; oba modele skrzydeł pobrane z HTTP 200.
  HP 2085 → 10485, oryginalne mikstury po rundzie miały około 3002 s i przetrwały
  reload. Artefakt usunięty, brak overflow i błędów JS/konsoli/HTTP.
- W eksporcie bazy zmienia się wyłącznie Seraphim w `dungeonSuperBuffs`.
  SaveVersion pozostaje 16; pozostałe rekordy i pola eksportu są identyczne.

## Weryfikacja superbuffów i mikstur (przed zmianą mocy Seraphim)

- `npm run check`: 528 testów / 59 plików, lint, format i TypeScript. Build poprawny.
- Testy na źródłowym eksporcie: dokładne progi 5/10/15/20, brak powtórek,
  blokada ulepszania superbuffów, wyłącznie EXP/SP dla Iris/pigułki, Cube +200%,
  współczynniki HP/MP Seraphim, prawdziwe wypłaty nagród z mnożnikami, zachowanie
  zwykłych nagród, mikstura >600 s na wejściu i przy końcu rundy, zapis po reload,
  oryginalny deadline absolutny w pauzie.
- GUI Chromium 320×740, 390×844 i 1280×900: symetria strzałek, brak licznika,
  wszystkie 19 wyborów, specjalne pule 4/3/2/1, brak overflow i błędów zasobów.
  Te przypadki korzystały z kontrolowanej porcji EXP kryształów w żywej logice
  serwisu, aby objąć wszystkie progi; nie są pomiarem tempa zdobywania poziomów.
- Osobna rzeczywista runda Belfist / Healer 80 ze źródłowym sprzętem +15 i dwoma
  zakupionymi boosterami: 600 s, 201 zabójstw, poziom podziemia 17. Wybrane Cube
  na 5, Seraphim na 10 i Iris na 15. Własne mikstury miały po rundzie około 3002 s.
  Ta próba była przyspieszona ×20, bez dodawania EXP/kryształów w trakcie rundy.
- Porównanie eksportu z poprzednią wersją: wszystkie wcześniejsze rekordy NPC,
  zwykłych skilli, przedmiotów i inne wspólne pola danych są identyczne. Doszły
  trzy pozycje przedmiotów do ikon oraz osobne definicje superbuffów.
- Końcowy build produkcyjny, test wyłącznie przez GUI i WASD: Belfist / Healer 80,
  390×844, pełne 600 s, 163 zabójstwa i poziom 15, bez dodawania EXP w trakcie.
  Wybrane Cube/Seraphim/Iris na 5/10/15. Maksymalne HP po Seraphim 2085 → 10485
  (źródłowe +8400 dla Healer). Mikstury miały po rundzie około 3004 s i przetrwały
  reload. Darmowe efekty zniknęły. Brak błędów JS/konsoli/HTTP i overflow.

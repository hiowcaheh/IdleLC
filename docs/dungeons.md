# Dungeons: Belfist Temple, Procyon Shrine, Maargadum

Wdrożenie z 2026-11-06, po przeglądzie zmian Claude’a do `9ad20b8`. SaveVersion **15**.
To nowy, aktywny tryb hordowy IdleLC. Nie zastępuje polowania na spotach ani wypraw AFK.

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
- 20 fal co 30 sekund. Budżet fali to `4 + numer fali` (łącznie do 290 potworów),
  odstęp spawnu 0,65 s; jednocześnie do 16 żywych NPC. Kolejka jest zachowana, gdy
  pole jest pełne. Kolejne fale używają wyższych pozycji oryginalnego zestawu NPC.
- Z zabitego potwora zostaje kryształ o wartości 1. Dopiero podniesienie daje EXP
  podziemia. Kryształy w promieniu 4,5 m lecą do postaci, zbierane są w promieniu 1,4 m.
  Podziemie zaczyna od poziomu 1 i EXP 0; limit to 20. Próg następnego poziomu:
  `3 + floor((poziom - 1) * 1.25)`.
- Awans zatrzymuje czas, ruch, efekty i walkę. Gracz wybiera jeden z trzech różnych
  buffów. Wybrane ID znika z puli do końca rundy; niewybrane może wrócić. Pula zawiera
  30 obsługiwanych buffów sześciu klas, także zaawansowanych, z ich najwyższymi
  źródłowymi rangami. Nie wydajemy SP i nie uczymy tych skilli na stałe. Wybrane
  błogosławieństwa kumulują się w tym własnym trybie hordowym.
- Buff wyboru trwa do końca rundy. Każdy efekt tymczasowy jest ograniczony pozostałym
  czasem rundy. Wyjście, śmierć i przerwanie usuwają efekty, również wypite boosty.
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
do zwykłej listy nauki. Ikony: 2069/2069 przedmiotów i zwykłe/dodatkowe skille z atlasów.

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
aktywnej gry. Zapis v14 migruje do v15 bez utraty postaci, przedmiotów i postępów.
Zamknięcie rundy nie wypłaca nic drugi raz.

Przechowujemy do 30 wyników i najlepszy wynik jednego podejścia dla każdego podziemia.
Okno ma miejsce pod ranking i pokazuje obecnie osobisty rekord lokalny. Nie udaje
rankingu online. Backend, globalny ranking i jego weryfikacja pozostają na później.

## Weryfikacja

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

# Naprawy po audycie a35cfbb — 2026-11-04

Punkt wyjścia: `a35cfbba2c1265cf3cae89004fdde5e71a68955f`. Właściciel po
audycie zezwolił na poprawianie wszystkich czternastu punktów. Ten raport
oddziela działające naprawy od przygotowanego kodu i nadal brakujących funkcji.
Nie oznacza pełnej zgodności z całym GameServer ani klientem.

## Stan czternastu punktów

| Nr  | Wdrożenie                                                                                                                                                                                                                                                                                              | Granica / pozostała praca                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Jedna aktywna sesja przeglądarki przez Web Locks; druga karta czeka i wczytuje aktualne konto po zwolnieniu sesji. Serwis dodatkowo odrzuca zapis na podstawie nieaktualnego snapshotu.                                                                                                                | Starsze otwarte wydanie trzeba odświeżyć; nie da się zmienić kodu już uruchomionej starej karty. Starsze przeglądarki mają odnawialną dzierżawę zamiast Web Locks.                                                                             |
| 2   | Widoczny czas jest zachowywany, logika konsumuje kroki 0,05 s, najwyżej 5 s na klatkę. Zaległość pozostaje. Ukryta karta nie zarabia automatycznie.                                                                                                                                                    | Animacje nadal mogą mieć niski FPS; nie jest to obietnica szybszego renderowania.                                                                                                                                                              |
| 3   | HP/MP pochodzą z tabel klas; atak, obrona i opcje z rzeczywistych kanałów sprzętu. INT zmienia atak laski Healer, DEX łuku. Usunięto skalowanie postaci do mediany NPC i typowego sprzętu. Premia hit broni +8 to źródłowe +3 punkty.                                                                  | Niepełny `CalcNewHitProb`, kanały obrony opcji i wyjątki damage nadal wymagają dalszego portu oraz danych NPC.                                                                                                                                 |
| 4   | Zachowujemy ONLYPOWER/ADDITION/RATE i typ ataku skilla. ADDITION nie oznacza już procentu zwykłego ciosu. Importer zachowuje magic level, hitrate/hit type, flagi, warunki, atrybuty NPC, sloty dropu i umiejętności NPC. Silnik ma cztery próby na 20 slotach i wybór skilla NPC według slotu/szansy. | Obecny eksport nie ma tych pól. Nowy drop i NPC AI nie są rzekomo aktywowane na starych danych. Stałe szanse magii, wyjątki i pełny damage pozostają nieukończone.                                                                             |
| 5   | AFK wykonuje ciągłą walkę z ograniczonym zapasem mikstur, zachowanymi efektami i cooldownami. Wypłata przypada na konkretne zabójstwa i awanse.                                                                                                                                                        | Jest to własny system IdleLC. Powrót nadal nie odtwarza trwałego, zapisanego stanu HP/MP z ostatniej klatki wyprawy.                                                                                                                           |
| 6   | Rozdzielono blood, poison, confusion, hold, stone, silence i stun. Ordinary DOT pozostawia 1 HP, a na PC ma redukcję ze źródła. Silence blokuje skille, hold ruch.                                                                                                                                     | Brakujące hitrate nie są zgadywane z power. Nauka skilli wymagających tej szansy czeka na SQL; sam enum nie oznacza aktywnego efektu w obecnym eksporcie.                                                                                      |
| 7   | STAT14 i opcja 66 nie podnoszą mnożnika krytyka. Przeniesiono osobny selector sześciu typów trafienia, z niezależnym Deadly i źródłowymi remisami. Premie strong/hard broni są osobne.                                                                                                                 | Selector wymaga rzeczywistego CON celu. Obecne NPC go nie mają; pozostaje dotychczasowy zastępczy krytyk. Nowa nauka zależnych pasywnych skilli jest zablokowana. Nie deklarujemy działającego Deadly dla wszystkich potworów.                 |
| 8   | Tyrant płaci okresowe MP i anuluje cały buff po braku many. Cure Poison usuwa poison, zachowując blood. Nowych SP nie można wydać na niekompletny skill.                                                                                                                                               | Reflection, taunt Veteran's Composure, przywołania i wzmocnienia Sorcerera, Charge, Invisibility, Far Seeing oraz Resurrection nie są ukończone. Potrzebne są dane i dalszy port aktorów/warunków. Nie dorobiono własnych parametrów summonów. |
| 9   | Wyprawa zachowuje historię tytułu przez zapis i odświeżenie. Premia działa do chwili wygaśnięcia; tytuł usuwa się po rozliczeniu.                                                                                                                                                                      | Nie przywraca to historii skasowanej przez starsze wydanie przed aktualizacją.                                                                                                                                                                 |
| 10  | Attack speed używa całkowitych impulsów, cooldown wzoru `IsReady` i zaokrąglenia do impulsu. Zniknął limit 50%. Znane guild/no-cool-time flags omijają modyfikacje.                                                                                                                                    | Nieznane flagi obecnego starego eksportu czekają na ponowny import.                                                                                                                                                                            |
| 11  | Naturalna regeneracja PC ma rytm 3 s, źródłowe bazy klas, warunki ruchu/walki/stania i kolejność pasywne/assist/opcje. Character pokazuje właściwy rytm.                                                                                                                                               | Pełne 1-sekundowe wykonanie wszystkich assistów i wyjątków serwera to osobny dalszy port; nie utożsamiamy go z naturalną regeneracją.                                                                                                          |
| 12  | Merac: oryginalne WTR/WLD, 23 miejsca walki, 38 modeli / 5667 instancji otoczenia. Egeha: 15 miejsc, 42 modele / 5205 instancji.                                                                                                                                                                       | Areny i trasa pozostają modelem idle, nie odtworzeniem oryginalnych serwerowych spawnów.                                                                                                                                                       |
| 13  | Dodano ścisły czytnik AEFF/ANEF oraz odzysk indywidualnych odwołań z `skills.lod`, z dwiema odmianami broni, fazami, opóźnieniami i flagami. Rozpoznano 75 profili.                                                                                                                                    | **Renderer skilli nadal nie jest ukończony**. Odzysk metadanych nie zastępuje renderera. Obecnego `SkillEffects` nie nazwano oryginalnymi FX 1:1.                                                                                              |
| 14  | Tab/Shift+Tab zostaje w najwyższym oknie, Escape zamyka tylko je, zamknięcie przywraca fokus. Wspólny hook obejmuje też ekspedycję i podsumowanie AFK.                                                                                                                                                 | Testowano Chromium i klawiaturę; bez fizycznego Safari/iPhone'a.                                                                                                                                                                               |

## Brakujące dane i blokady nauki

W obecnym `lc-data.json` jest 279 NPC bez CON, magic avoid i pełnych slotów dropu
oraz 728 poziomów efektów bez hitrate. Nie ma pełnego `newproject_data.sql` w
otrzymanych archiwach klienta i źródeł. Zapytano właściciela o link do tego zrzutu.
Nie przepisujemy parametrów z podobnego potwora, nazwy ani opisu skilla.

Z 119 skilli 93 przechodzą obecną kontrolę nauki. Nie jest to etykieta pełnej
zgodności wszystkich ich warunków i szans ze źródłem. Dwanaście dostępnych netto ubyło
w wyniku ujawnienia brakujących szans/elementów; Cure Poison stał się dostępny.
Lista 26 zablokowanych wpisów jest w [wynikach](audit-fixes-validation.json).
Zapisane poziomy i wydane wcześniej punkty nie są kasowane. Rozpoznane składniki
posiadanych skilli pozostają wykonywane; czysto niewykonalny skill nie spala MP
w pętli. Jest to zabezpieczenie przed kolejnym wydawaniem SP, nie ukończenie klasy.

Następny etap wymaga importu pełnego SQL i testu rozkładów hit/drop na jego
rekordach. Aktorzy summonów i renderer FX wymagają również dalszego kodu;
sam SQL ich nie uruchomi.

## Dowody i źródła

Prefiksy S/C/A oraz hashe archiwów: [audyt źródeł](source-audit/README.md).

- S `Descriptor.cpp`: kontrola duplikatu sesji; odpowiednikiem lokalnym jest
  blokada właściciela zapisu, bez dodawania backendu.
- S `PC.cpp:58–138,2408–2480,2556–2611,3530–3608`: zasoby klas, naturalny
  odzysk i premie broni. `Character.cpp:387–440`: szybkość i grupy assistów.
- S `Battle_GetDamage.cpp:608–650,863–1003,1288–1450,1844–2007`:
  kanały obrażeń, moc skilla i typy trafień. Literalna arytmetyka rate w
  `_Adult` różni się od pakietu arkusza; nie poprawiano źródła po cichu.
- S `Skill.h:72–198`, `Assist.cpp:406–563,683–705`: enumy, nieśmiertelny
  zwykły DOT i MP_CANCEL. Szansa jest oddzielnym `a_hitrate`.
- S `Skill.cpp:665–730`, `Config.h:1030`: cooldown i 3-sekundowa regeneracja.
- S `Battle_NPCDropItem.cpp:79–111`, `NPCProto.cpp:280–312,372–390`,
  `MobActivity.cpp:1734–1760`: sloty dropu, statystyki i umiejętności NPC.
- C `Engine/Ska/ModelInstance.cpp:1732,2005`: kompletne rekordy AEFF/ANEF.
  `Engine/Entities/Skill.cpp:140–321`: profile `skills.lod`.
- A `Data/World/Merac/Merac.wtr/.wld` i `Egeha/Egeha.wtr/.wld`.

## Walidacja

- Pełne `npm run check`: **416 testów / 47 plików**, lint, formatowanie i TypeScript.
  Produkcyjny build również przeszedł.
- Osobne próby na rzeczywistym LC JSON, ponieważ standardowe testy projektu
  celowo używają danych zastępczych. Healer 30 / Forgiving Staff 619:
  bez punktów atak 81, +10 INT atak 87, +10 DEX nadal 81; arkusz i walka zgodne.
- Kontrolowane 60 s przy 2/5/10/20/60 FPS: ten sam czas, wynik i ciąg zdarzeń RNG.
  Test nie jest benchmarkiem telefonu.
- AFK: ograniczone mikstury, granice awansów/tytułu, historia tytułu przez
  ponowny `LocalGameService.load`. Podgląd godzinowy nie steruje wypłatą.
- Chromium, 390×844, produkcyjny build: rozdanie INT, przeładowanie zapisu,
  zagnieżdżony modal broni, pętle Tab/Shift+Tab, Escape, przywrócenie fokusu,
  ekspedycja. Dwie rzeczywiste karty: zakup Reviving Tiara za 692581 nie znika,
  druga karta wznawia grę z aktualnym kontem po zamknięciu pierwszej.
- Przejścia Juno → Dratan → Merac → Egeha → Juno. Każdy loader miał `contain`
  i `transform:none`; nowe tereny i otoczenie widoczne w obrazie sceny.
- Ukończony przebieg przeglądarki: zero błędów strony, konsoli, HTTP i żądań.
  Osobny przebieg z wyłączonym Web Locks potwierdził blokadę i przejęcie sesji
  przez mechanizm dzierżawy. Sprawdzono również geometrię, tekstury i skończone
  wartości wszystkich 807 accessorów obu nowych GLB otoczenia.
  Domena Pages jest blokowana przez politykę sieci środowiska; testowano lokalny
  build. Publikację weryfikuje osobno status GitHub Actions, nie deklaracja
  obejrzenia publicznej strony.

SaveVersion pozostaje **14**. Nie przenoszono kont, nie kasowano przedmiotów,
plusów, rozdzielonych atrybutów ani wcześniejszych nagród. Zmiana pochodnych
statystyk i regeneracji wpływa na tempo walki; nie korygowano go nowymi mnożnikami.

Konwersja map: `npm run convert-lc -- --client <katalog> --only terrain --map merac`
oraz analogicznie `egeha`. Odzysk referencji FX:
`node scripts/lc/skill-effects.mjs --client <katalog> <plik-wynikowy>`.
Surowe pliki i archiwa pozostają poza Git. Maszynowe wyniki:
[audit-fixes-validation.json](audit-fixes-validation.json).

# Laca Ball, niedzielne nagrody i Auto ×2 (2026-11-11)

Baza: `415242c`, branch main. SaveVersion **18**, migracja 17→18 zachowuje
postacie, ekwipunek, Cash, kalendarz, Dungeons, World Boss i zarezerwowane Moonstone.

## Reguły właściciela

- Niedziela w Weekly zajmuje cały dolny rząd i ma złote wyróżnienie. Daje jeden
  500 Cash Ticket (95015). Każda niedziela w Monthly daje drugi taki bilet,
  również gdy wypada ostatniego dnia miesiąca. Wspólny odbiór po 10 minutach
  online przyznaje dwa bilety, łącznie 1000 Cash po ich użyciu. Zachowane limity
  konta, jedna data UTC, historia odbiorów i brak odbioru wstecz.
- Kalendarz ma tę samą ikonę, w trzeciej kolumnie na lewo od Dungeons.
  Laca Ball zajmuje jego poprzednie miejsce pod Moonstone.
- Token 5123 ma osobny rzut 1% za każde zabicie: Idle, AFK, ekspedycje,
  Dungeons i World Boss. Rzut w `rewardKills`, poza bramką różnicy poziomów;
  mnożniki dropu nie zmieniają szansy. Nie dublować go w GENERAL_DROPS.
- ItemShop sprzedaje Token ×100 za 1000 Cash oraz Gold token ×50 za 750 Cash.
  Gold token 5124 jest odtąd tylko w ItemShop. Przyszłe losowania Perfect
  Moonstone zamiast Gold token ×3 dają Token ×3, z tą samą wagą 60000.
  Surowa tabela Moonstone w lc-data pozostaje źródłowa; zmiana w adapterze.
  Istniejące przedmioty i już zapisane wyniki losowania nie są usuwane.

## Oryginalne źródła i granice adaptacji

- `GameServer/LacaRette.cpp`, `GetNeedTokenCount`: Course A kosztuje 2 Token
  lub 1 Gold token; Course B 3 Token lub 1 Gold token; Gold Course 2 Gold token.
  Zwykły koszt rośnie o `floor(max(1, repeat)/5)`. Pierwszych pięć gier ma bazową
  cenę, szósta wyższą. Licznik obejmuje wszystkie kursy i oba żetony na koncie.
- `Connector/ProcConnMsg.cpp`, `LacaretteRepeat`: reset kosztu po 24 godzinach
  bez gry, nie o północy. Gold token ma stały koszt.
- `GameServer/ProcConnMsg.cpp`, `MSG_CONN_LACARETTE_RETTE_REP`: jeden rzut
  1..10000 i dziesięć kolejnych przedziałów nagród. Zachowane źródłowe wagi:
  A/B 10/100/390/700/800/1000/1500/1500/2000/2000;
  Gold 10/100/390/700/800/1000/1000/1500/1500/3000.
- `Engine/Interface/UILacarette.cpp`, `CUILacaball`: ramka 500×375,
  `Data/Interface/lacaball.tex`, trzynaście klatek potrząsania po 100 ms,
  wypadająca i odbijająca się kula, koszyk, czerwony Start oraz kapsuła nagrody.
  Przeniesione grafiki, etapy animacji i pola wyboru. Układ HTML dopasowuje się
  do telefonu; lista pokazuje też jawne szanse. Pełna sekwencja IdleLC trwa 3,2 s.
- Wyłącznie trzy zwykłe kursy; bez kursów testowych i dodatkowego darmowego
  przydziału żetonów od NPC. Zawartości nagród poniżej są konfiguracją IdleLC
  na wyraźne polecenie właściciela; nie przedstawiać ich jako oryginalnego dropu.

## Nagrody według kolejności przedziałów

| Kurs | Nagrody od najrzadszej do najczęstszej                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A    | 500 Cash Ticket ×1; Perfect Moonstone ×2; Heaven Stone ×5; Golden magnifying glass ×3; Blessed Iris ×1; Good Moonstone ×3; Platinum Super Skill Pill ×1; Moonstone Box ×5; Platinum Small Healing Potion ×50; Platinum Small Mana Potion ×50      |
| B    | 1000 Cash Ticket ×1; Perfect Moonstone ×3; Heaven Stone ×10; Golden magnifying glass ×5; Blessed Iris ×2; Good Moonstone ×5; Platinum Super Skill Pill ×2; Moonstone Box ×10; Platinum Small Healing Potion ×100; Platinum Small Mana Potion ×100 |
| Gold | 1000 Cash Ticket ×3; 500 Cash Ticket ×1; Perfect Moonstone ×10; Heaven Stone ×25; Golden magnifying glass ×10; Blessed Iris ×5; Platinum Super Skill Pill ×5; Good Moonstone ×15; Moonstone Box ×25; Platinum Small Healing Potion ×250           |

## Zapis i przekazanie dla Claude

`SaveData.lacaBall` przechowuje konto: `repeat`, `lastPlayedAt` i opcjonalne
`pending`. Rezerwacja zawiera ID rundy i postaci, kurs, walutę, koszt, początek
i jeden wynik. Start zabiera żetony i zapisuje rezerwację razem. Dopiero koniec
animacji oraz minimum 3200 ms pozwalają `finishLacaBall` dopisać nagrodę do
aktualnego inventory, usunąć pending i wyświetlić BagFeed. Brak ponownego rzutu,
podwójnej wypłaty i nadpisania zakupów zrobionych w międzyczasie.

Zamknięcie, ukrycie karty i reload nie wypłacają w tle. Resume powtarza animację
tej samej rezerwacji bez nowej opłaty. Inna postać nie odbierze wyniku i nie
rozpocznie gry do czasu zakończenia oczekującej rundy. Nowy Start jest blokowany
podczas ekspedycji, Dungeons i World Bossa. Zapisy serwisu cofają stan w pamięci
po konflikcie z inną kartą, tak jak Moonstone.

Eksport samych zasobów Laca Ball, bez nadpisania pozostałych aktualizacji:

```sh
node scripts/lc/lacaball-assets.mjs /path/newproject_data.sql /path/client
```

Skrypt tworzy `lc-lacaball.json`, włącza źródłowe 5123/5124, przelicza atlas ikon
z revision i wycina elementy lacaball.tex. `import-db.mjs` również zachowuje oba
żetony i ich opisy. Własne nagrody edytować w `src/game/data/lacaball.ts`.

## Moonstone

Napis w polu Statui obniżony do środka oryginalnej tabliczki. Auto ×2 skraca obrót
z 3000 do 1500 ms oraz przerwę z 700 do 350 ms. Czas zapisany w rezerwacji
`durationMs`: animacja i minimalny termin wypłaty używają tej samej wartości.
Starsze i nieprawidłowe wartości dają 3000 ms. Zmiana Auto w trakcie obrotu
obowiązuje następny obrót; Resume zachowuje tempo już zapisanej rundy.

## Weryfikacja

**649 testów / 81 plików**, pełne check i produkcyjny build. Chromium na buildzie
produkcyjnym: oba kalendarze w siedmiu rozmiarach 320×568..1280×900, również
568×320 w poziomie, bez przewijania; pełna szerokość niedzieli i złote Monthly.
Laca Ball w czterech rozmiarach: kursy, waluty, rezerwacja, wypłata po animacji,
zamknięcie i reload tej samej rundy bez drugiej opłaty. Przetestowany Gold Course,
widoczna kapsuła i BagFeed. Rzeczywiste zakupy obu pakietów potwierdzają ceny
i ilości. Moonstone: Auto 1500 ms, Stop i ręczne 3000 ms oraz położenie napisu.

Osobna próba niedzieli w GUI na przygotowanym zapisie z datą 15 listopada:
odebrane dwa bilety 500, użyte oba w Inventory, saldo wzrosło do 1000 Cash;
reload zachował saldo i odebraną datę. Testy używają przygotowanych zapisów,
nie są pomiarem balansu ani FPS. [Zapis weryfikacji](lacaball-validation.json).

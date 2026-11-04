# PvE: poziomy, losowe nagrody, Mist i teren Dratan

2026-11-04, punkt wyjścia `bf61f0f`. Zakres odpowiada czterem nowym zgłoszeniom
właściciela. SaveVersion pozostaje **14**; dotychczasowe postępy i otrzymane nagrody
nie są przeliczane wstecz. Raport: [walidacja](pve-dratan-validation.json).

## Kolory nazw

Progi pochodzą z `UIManager.cpp:2321–2325` oraz
`UITargetInfo.cpp:39–43,465–469` klienta 2018. Dla różnicy
`poziom potwora − poziom postaci`:

| Różnica        | Kolor nazwy | RGB źródła |
| -------------- | ----------- | ---------- |
| co najmniej +6 | czerwony    | `#ce4900`  |
| +3…+5          | żółty       | `#d7aa00`  |
| −2…+2          | biały/szary | `#c5c5c5`  |
| −5…−3          | zielony     | `#5b9900`  |
| najwyżej −6    | niebieski   | `#008baa`  |

Poprzednie granice +5 / −7 i kolory były własnym przybliżeniem. Kolor obejmuje teraz
całą nazwę nad potworem, nazwę w panelu polowania oraz listę i podgląd Book. Tagi
poziomu mają tę samą paletę. Usunięto stały kolor typografii paneli, który nadpisywał
klasy poziomu.

## Nagrody solo według serwera

Źródła: `Battle_DivisionExpSP.cpp:19–20,135–156,226–230,1358–1384`,
`ShareLib/Config.h:956–960` oraz `Battle_NPCDropItem.cpp:79–115,495–528`.
W lokalnej walce solo bohater jest jedynym właścicielem obrażeń, a jego udział
wynosi 100%. Brakujące eventy, premium i party nie otrzymują wymyślonych mnożników.

`pveLevels.ts` wyznacza procenty bazy i możliwość dropu. Dla przewagi poziomu postaci
nad potworem:

| Przewaga postaci | EXP bazy | SP bazy | Przedmioty | Szansa złota |
| ---------------- | -------: | ------: | ---------- | -----------: |
| 0 lub mniejsza   |     100% |    100% | tak        |          80% |
| 1                |      95% |     90% | tak        |          75% |
| 2                |      90% |     80% | tak        |          70% |
| 3                |      75% |     70% | tak        |          65% |
| 4                |      60% |     60% | tak        |          60% |
| 5                |      45% |     50% | tak        |          55% |
| 6                |      10% |     40% | nie        |          50% |
| 9                |      10% |     10% | nie        |          35% |
| 10               |      10% |     0%* | nie        |          30% |
| 16 lub więcej    |      10% |     0%* | nie        |           0% |

\* Źródło stosuje następnie minimum **1 jednostki wewnętrznej**, czyli 0,0001 SP.
EXP ma minimum 1. Oryginalna kara poziomu nie zeruje całego EXP; od przewagi 6
pozostaje 10% bazy. Niebieski kolor nazwy odpowiada blokadzie zwykłych przedmiotów,
a pozostałe nagrody mają własne progi.

Każde zabójstwo otrzymuje osobne losowania:

1. `value = trunc(baza × procentPoziomu / 100)`.
2. EXP i SP niezależnie: `value += trunc(value × randomInt(-10,10) / 100)`.
3. Minimum 1, następnie istniejące procenty opcji EXP/SP 82/83 sprzętu i tytułu,
   z osobnym obcięciem na zabójstwo. Ujemny składnik losowy jest obcinany do zera
   tak jak dzielenie całkowite C++; `floor` dawałby inne wyniki.
4. Złoto: `randomInt(1,10000) ≤ max(0,8000 − przewaga × 500)`;
   po sukcesie `trunc(a_prize × randomInt(50,150) / 100)`.

Szansa Nas używa neutralnego runtime money rate 100%. Nie zakładamy aktywnego
eventu ani nieznanej konfiguracji `t_drop_prob`. Przy równych poziomach brak złota
jest poprawnym wynikiem około 20% zabójstw.

Przykład dla Poison Mist i równych poziomów: baza 23 058 EXP / 1000 jednostek SP /
308 Nas daje 20 753…25 363 EXP, 0,09…0,11 SP oraz 154…462 Nas przy udanym losowaniu
złota. Losowania mogą się powtarzać. Przy małych bazach kilka procentów może również
dać ten sam wynik po obcięciu; wymuszanie innej liczby na każdym zabójstwie
zmieniałoby regułę serwera.

`rewardKills` jest wspólną wypłatą aktywnej walki i AFK. Przelicza poziom po każdym
zabójstwie, więc awans w środku raportu lub odcinka AFK zmienia kolejną nagrodę
i możliwość dropu. Gate obejmuje też istniejące dodatkowe losowania akcesoriów
i Smelting Stone. Licznik zabić, postęp spotu i nagrody księgi nadal działają.
Algorytm niezależnych wpisów tabeli przedmiotów i własne szanse dodatkowych dropów
pozostają jak wcześniej; cztery źródłowe próby wyboru spośród 20 slotów wymagają
osobnego portu pełnych tabel.

`killReward` służy teraz wyłącznie estymacji: oblicza dokładną średnią wszystkich
21 losowań EXP/SP i 101 kwot złota, uwzględniając obcięcia i szansę braku złota.
Wypłata korzysta z losowań, a podgląd wyprawy i szacunek godzinowy z wartości
oczekiwanych. W Book podpisano dane jako Base EXP / Base SP / Base gold. Feed
pokazuje SP z dokładnością do 1/10 000, dzięki czemu minimalna nagroda nie wygląda
jak „+0 SP”.

## Półprzezroczystość rodziny Mist

Naprawa obejmuje modele `mist_gr` i `mist`, używane przez Poison Mist (418), Elite
Poison Mist (445), Master of Secret Technique (245, rodzina Mystic) i Elite Mystic
(449). Przyczyną prostokątów był zapis `Default.sha` jako OPAQUE i wymuszenie
alfy koloru na 1. Obie oryginalne siatki mają kolor `0xfaf5f6d5`, flagi 7 i tekstury
z miękką przezroczystością.

`Shaders/DefaultShader.cpp:211–220` wybiera blending na podstawie alfy koloru
materiału, z wyjątkiem Always Opaque (bit 3); `Shader.h:21–22` definiuje Double Sided
i Full Bright. Konwerter zachowuje alfę **213/255**, kanał alpha PNG, dwustronność
oraz Full Bright jako `KHR_materials_unlit`. Default z pełną alfą używa alpha testu
MASK; Always Opaque ma pierwszeństwo przed półprzezroczystym kolorem.
Półprzezroczyste Full Bright nie rzucają pełnych, prostokątnych cieni swoich
siatek. Kopie materiałów unlit są zwalniane przy zmianie modelu, tak jak materiały
oświetlane.

Regeneracja przeszła w trybie strict, bez brakujących tekstur ani animacji.
Zbiory `Mist.ba` i `Mist_gr.ba` zawierają `m_mist_att02`; baza dla `mist` wymagała
`w2mist_att02`. Jawny alias zachowuje pierwszeństwo dokładnego klipu i udostępnia
drugi oryginalny atak zamiast jego pomijania. Każdy model ma 56 kości i osiem klipów.
Manifest zawiera nowe hashe URL, a pozostałe modele i sprzęt nie są regenerowane.
To poprawka materiałów i animacji modelu, nie pełny port `ANIMEFFECT`/BAE.

```sh
npm run convert-lc -- --client '<klient 2015>' --only mist,mist_gr --strict
```

## Oryginalny teren Dratan

`lc-zone-4` korzysta teraz z `public/maps/dratan/`, bez proceduralnego zastępstwa:

- `Data/World/Dratan/Dratan.wtr`: wysokości 513×513, komórka 6 m, rozmiar 3072×3072 m,
  11 źródłowych warstw tekstur i trzy arkusze masek. `heights.bin` jest identyczny
  z odczytaną źródłową mapą wysokości.
- `Dratan.wld`: oryginalne pozycje palm, kaktusów, drzew, skał, namiotów i innych
  obiektów. Jak na Juno, eksport obejmuje otoczenie trasy polowania: 20 modeli,
  264 instancje ze źródłowych 265 modeli / 6092 instancji świata. Zestaw mapy ma
  około 1,43 MB. Oświetlenie pustyni jest dobrane w adapterze sceny.
- 42 areny odpowiadają istniejącym 42 spotom. Wybór jest własną regułą idle:
  równy teren, margines mapy 120 m, brak wysokich przeszkód w promieniu 14 m,
  odstęp 50 m i obiekty widoczne przed kamerą. Miasto pochodzi z klastra budynków
  świata; areny nie są przedstawiane jako źródłowe spawny `t_npc_regen`.
- Shader obsługuje wszystkie 11 warstw; wraz z trzema maskami i jedną mapą cienia
  mieści się w limicie 16 samplerów WebGL. Juno zachowuje swoje dotychczasowe dane.
- Teren jest dzielony na kafle po 64×64 komórki. Dratan ma 64 fragmenty; frustum
  culling pomija dalekie części zamiast rysować wszystkie 524 288 trójkątów na
  każdej klatce. Podział zachowuje wszystkie próbki i identyczne normalne na
  wspólnych krawędziach, bez upraszczania kształtu. Geometria i materiały są zwalniane
  po zmianie mapy. Ten sam renderer obsługuje Juno.
- Zachowano kolejność spotów, blokady miast, bieg między spotami, loader `contain`,
  ustalanie kamery i nazwę po wejściu. Merac/Egeha nadal używają dotychczasowego terenu.

```sh
npm run convert-lc -- --client '<klient 2015>' --only terrain --map dratan
```

Opcja `--map` ogranicza regenerację do wybranej mapy, a niedostateczna liczba aren
przerywa konwersję. Surowe WTR/WLD/TEX i archiwum klienta pozostają poza repozytorium.

## Kontrola

Testy obejmują wszystkie granice kolorów i kar, niezależne losowania, C++ trunc,
rozkład złota, opcje/wygaśnięcie tytułu, awans między zabójstwami, blokadę dropu,
rozliczenie i zapis w serwisie oraz AFK. Test konwertera sprawdza zachowanie miękkiej
alfy, Full Bright, Always Opaque i alias drugiego ataku. Kontrola artefaktów dekoduje
GLB i PNG, porównuje wysokości i instancje świata oraz mierzy nachylenie/przeszkody
każdej areny. Testy geometrii kontrolują liczbę trójkątów, resztkowe kafle, granice
do cullingu oraz identyczność wysokości i normalnych na szwach. Wyniki przeglądarki
i ograniczenia są w raporcie walidacji.

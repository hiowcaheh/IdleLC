# Statystyki klas: potwierdzone źródło i próbki referencyjne

> Raport źródłowy z analizy 2026-11-02, porównujący stan IdleLC `c9944c9` przed wdrożeniem. Opisy „obecnie”, „bez zmian” i numery linii IdleLC dotyczą tego punktu odniesienia. Aktualny stan wdrożenia: [przekazanie prac](../development-handoff.md). Pochodzenie i prefiksy źródeł: [indeks audytu](README.md).

Źródło: `S/GameServer/PC.cpp`. Tabele są w liniach 58–138, gałąź inicjalizacji klas bazowych w 1420–1477, odrębne profesje w dalszej części `InitStat`, a składanie końcowego arkusza w `CalcStatus` od 2518.

## Bazowe wartości sześciu klas

Poniższe liczby dotyczą poziomu 1, `m_job2=0`, bez rozdanych dodatkowych punktów, wyposażenia, pasywnych umiejętności i assistów. Nie są końcowym arkuszem ubranego bohatera.

| Klasa    | STR | DEX | INT | CON |  HP |  MP | HP na poziom | MP na poziom |
| -------- | --: | --: | --: | --: | --: | --: | -----------: | -----------: |
| Titan    |  50 |  20 |  20 |  50 | 180 |  68 |           36 |           14 |
| Knight   |  38 |  28 |  28 |  38 | 150 |  86 |           30 |           16 |
| Healer   |  20 |  50 |  38 |  28 | 110 | 108 |           18 |           22 |
| Mage     |  20 |  50 |  50 |  20 |  90 | 122 |           11 |           31 |
| Rogue    |  38 |  50 |  20 |  28 | 130 |  56 |           27 |            9 |
| Sorcerer |  20 |  44 |  44 |  28 | 110 | 128 |           15 |           29 |

Przyrost HP/MP w tabeli jest wyliczony dla tej konkretnej gałęzi i zerowych dodatkowych punktów. Przykładowo Knight ma automatycznie +2 do każdego z czterech atrybutów na poziom; HP rośnie o `2*4 + 2*11 = 30`, MP o `2*6 + 2*2 = 16`. Poziom 20 daje bazowe HP 720 / MP 390.

Ogólna gałąź `InitStat`:

```text
up[a] = growth[job][a] * (level - 1) + allocatedPoints[a]
attribute[a] = baseAttribute[job][a] + up[a]
HP = baseHP[job] + sum(up[a] * hpCoefficient[job][a])
MP = baseMP[job] + sum(up[a] * mpCoefficient[job][a])
```

Profesje mają inne tabele i wzory; nie należy stosować powyższych przyrostów do każdej postaci w oryginalnej grze. Obecne IdleLC nie zapisuje ani profesji, ani rozdanych STR/DEX/INT/CON, dlatego wierny port wymaga rozszerzenia modelu i przemyślenia migracji istniejących postaci.

## Końcowy arkusz i regeneracja

`CalcStatus` odtwarza bazowe pola `m_db*`, następnie stosuje wyposażenie, pasywki, tytuł/artifact oraz assist. Dalsze przeliczenia obejmują osobne kanały ataku i obrony, opcje, premie procentowe i reguły plusów. Wartości wyświetlane oraz wartości używane w `GetDamage` nie są zawsze tym samym polem. Szczegóły opisują raporty walki i przedmiotów.

`PC.cpp:2556–2604` wyznacza naturalne recoverHP/recoverMP klasowo. `RecoverPC` od 2408 zmniejsza regenerację do 1/1 podczas ruchu, walki lub castowania, poza siedzeniem stosuje 25% bazowej wartości, a następnie dolicza właściwe modyfikatory. Nie odpowiada to obecnej stałej regeneracji procentowej IdleLC. Serwer wywołuje naturalną regenerację co 3 sekundy; okresowe efekty assist mają oddzielny tick 1 sekundy.

## Weryfikacja i jej granice

W `reference/class_stats.cpp` znajduje się mały program zawierający wyciąg oryginalnych tabel C++ i wyliczenie gałęzi bez profesji/punktów. Skompilowano go i sprawdzono sześć bazowych par HP/MP; wynik zawiera 30 przypadków dla sześciu klas i poziomów 1, 2, 20, 50, 100 w `reference/class-stats.json`.

To próbki referencyjne wybranej gałęzi, nie test uruchomionego `GameServer`, całego `CalcStatus`, rozdawania punktów czy zmian profesji. Żadne pliki źródłowe ani pliki IdleLC nie zostały zmienione.

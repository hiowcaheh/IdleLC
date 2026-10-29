# Baza danych LC (zrzut MySQL, luty 2016) — co gdzie jest

Decyzja właściciela: dane gry mają być **1:1 z tej bazy**. Sam zrzut nie trafia do repo — trafiają dane
wygenerowane z niego przez `npm run import-lc-db` (`src/game/data/generated/`). Do analizy ładujemy go do SQLite:

```bash
python3 tools/lc-db/mysql2sqlite.py /tmp/lc.sqlite <zrzut>/newproject_data.sql
python3 tools/lc-db/q.py /tmp/lc.sqlite "select a_index, a_name_usa, a_level from t_npc limit 5"
```

Uwaga: część kolumn liczbowych jest zapisana jako tekst — w zapytaniach używaj `cast(x as int)`.
Nazwy angielskie są w kolumnach `*_usa` (też `*_uk`); kolumna bez sufiksu jest po koreańsku.

## Pliki zrzutu

| Plik                         | Zawartość                                                              |
| ---------------------------- | ---------------------------------------------------------------------- |
| `newproject_data.sql`        | **dane gry** (81 tabel): potwory, przedmioty, umiejętności, drop, exp… |
| `newproject_data-unused.sql` | nieużywane/dodatkowe tabele (spawny eventowe, katalogi sklepu)         |
| `newproject_db.sql`          | **schemat** postaci graczy (bez danych)                                |
| `newproject_db_auth*.sql`    | schemat kont (bez danych)                                              |

Brak danych osobowych graczy — pliki `db*` zawierają tylko struktury tabel.

## Klasy (`a_job`)

`0` Titan, `1` Knight, `2` Healer, `3` Mage, `4` Rogue, `5` Sorcerer, `6` Nightshadow, `7` Ex-Rogue, `8` Archmage.
Podklasy: `a_job2` = 1 lub 2 (każda klasa ma dwie ścieżki). Na start IdleLC: Titan, Knight, Healer, Mage,
Rogue, Sorcerer.

Maska klas w przedmiotach (`t_item.a_job_flag`): bit 0 Titan, 1 Knight, 2 Healer, 3 Mage, 4 Rogue,
5 Sorcerer, 6 Nightshadow (np. `2` = tylko Knight).

**Statystyk startowych klas i przyrostu na poziom w bazie nie ma** (w LC są w kodzie serwera).
Postać gracza (`newproject_db.sql: t_characters`) ma: `a_level, a_exp, a_str, a_dex, a_int, a_con,
a_hp, a_max_hp, a_mp, a_max_mp, a_statpt_remain` (+ rozdane `a_statpt_*`), `a_skill_point`, `a_nas` (złoto),
`a_job, a_job2`, tytuły, zwierzaki, gildia.

## Doświadczenie — `t_exp`

`a_level` 1…185, `a_exp` = exp potrzebny na następny poziom. Przykład: poziom 1 → 34, 10 → 18 748,
30 → 4 046 233, 99 → 15 311 269 135. Max poziom IdleLC na start: 99 (tempo zostaje jak w LC,
właściciel planuje bonusy do EXP).

## Potwory i NPC — `t_npc` (1 589 wierszy)

| Kolumny                                 | Znaczenie                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| `a_name_usa`, `a_level`                 | nazwa, poziom                                                                           |
| `a_hp, a_mp, a_attack, a_magic`         | życie, mana, atak fizyczny/magiczny                                                     |
| `a_defense, a_resist, a_hit, a_dodge`   | obrona, odporność magiczna, celność, unik                                               |
| `a_attackSpeed`                         | szybkość ataku; prawdopodobnie dziesiąte części sekundy (19 ≈ 1,9 s) — do potwierdzenia |
| `a_exp`, `a_prize`                      | exp i złoto za zabicie                                                                  |
| `a_walk_speed, a_run_speed`, `a_sight`  | ruch, zasięg wzroku                                                                     |
| `a_file_smc`                            | **model** (np. `Data\monster\Animals\Fox.smc`)                                          |
| `a_scale`                               | **skala modelu** (np. Little Fox 0.8, Elite Jaguar 1.2)                                 |
| `a_motion_idle/walk/run/attack/dam/die` | **nazwy animacji w `.ba`** (np. `m_fo`, `m_fo_att`, `m_fo_da`)                          |
| `a_motion_idle2`, `a_motion_attack2`    | druga animacja spoczynku i ataku (zwykle ta sama co pierwsza; sfinksy mają `att02`)     |
| `a_item_0…19`, `a_item_percent_0…19`    | **drop**: id przedmiotu i szansa w 1/10000 (500 = 5 %)                                  |
| `a_minplus, a_maxplus, a_probplus`      | drop sprzętu z ulepszeniem +min…+max (elity: +1…+4)                                     |
| `a_flag`                                | maska cech; elita = bit 27 (`0x08000000`), pozostałe bity do ustalenia                  |
| `a_skill0…3`                            | umiejętności potwora                                                                    |

Z `a_file_smc`, `a_scale` i `a_motion_*` generujemy manifest modeli 1:1.
Elity mają typowo 2× HP, 3× exp, więcej złota i drop z „+”.

Przykład (Fox): poziom 1, HP 150, atak 8, obrona 54, exp 17, złoto 3, model `Fox.smc`, animacje
`m_fo / m_fo_run / m_fo_att / m_fo_da / m_fo_die`, drop m.in. Fox Tail 35 %.

## Rozstawienie potworów — `t_npc_regen` (20 987)

`a_zone_num, a_npc_idx, a_pos_x, a_pos_z, a_pos_h, a_regen_sec, a_total_num` — gdzie i ile potworów
się odradza. Z tego bierzemy, które potwory należą do której strefy (np. strefa 0: lisy, jelenie, wilki,
jaguary, drzewce…).

## Strefy — `t_zonedata` (43), `t_mapinfo`

`a_zone_index, a_name` (po koreańsku), `a_minlevel, a_maxlevel`, rozmiar, kontynent. Strefa 0 = miasto
startowe z okolicą; dalej lochy, PvP, kolejne miasta. Angielskie nazwy stref trzeba znaleźć w `t_string`
albo w kliencie.

## Przedmioty — `t_item` (11 284)

| Kolumny                                        | Znaczenie                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `a_type_idx`, `a_subtype_idx`                  | typ (0 broń, 1 zbroja, 2 zwój/księga, 4 materiał, 5 akcesorium, 6 mikstura…) i podtyp                         |
| `a_wearing`                                    | slot: 0 hełm, 1 tors, 2 broń, 3 spodnie, 4 tarcza, 5 rękawice, 6 buty, 7 akcesorium, 10 zwierzak, 11 skrzydła |
| `a_num_0…4`                                    | statystyki (broń: `num_0` atak, zbroja: `num_0` obrona …)                                                     |
| `a_level`, `a_job_flag`, `a_price`, `a_weight` | wymagany poziom, klasy, cena, waga                                                                            |
| `a_file_smc`                                   | model przedmiotu (broń, część zbroi)                                                                          |
| `a_texture_id, a_texture_row, a_texture_col`   | **ikona**: atlas `ItemBtn{id}.tex`, komórka 32×32                                                             |
| `a_rare_index_0…9`, `a_rare_prob_0…9`          | możliwe rzadkie prefiksy                                                                                      |
| `a_set_0…4`, `a_grade`                         | sety, klasa przedmiotu                                                                                        |

Podtypy broni (przypisanie do klas wg nazw i `a_job_flag`, część do potwierdzenia): 0 miecz (Knight),
1 kusza (Rogue), 2 laska (Mage), 3 wielki miecz i 4 topór (Titan), 5 różdżka, 6 łuk (Healer),
7 sztylet (Rogue), 11 dwa miecze (Knight), 12 berło, 13 kosa i 14 halabarda (Sorcerer), 15 duch (Nightshadow). Nowy tier broni co 4 poziomy, zbroi co 5.

## Pozostałe tabele dot. sprzętu i dropu

- `t_option` — rodzaje losowych opcji przedmiotów (STR, HP, atak, krytyk, kradzież HP…).
- `t_rareoption` — rzadkie prefiksy w 5 stopniach (`a_grade`).
- `t_set_item` — 276 setów z bonusami.
- `t_jewel_data` — klejnoty do socketów (składanie, szanse).
- `t_drop_item_head/_data`, `t_npc_drop_all`, `t_npc_dropraid` — dropy globalne, eventowe, rajdowe.
- `t_shop`, `t_shopitem` — sklepy NPC w miastach. `t_shop.a_sell_rate` (40 we wszystkich sklepach) — ile %
  ceny sklep płaci graczowi za przedmiot; `a_buy_rate` (100) — ile % ceny płaci gracz.
- `t_crafting`, `t_decompose`, `t_special_skill` — rzemiosło i umiejętności zbierackie.

## Umiejętności — `t_skill` (1 849), `t_magic`

`a_job, a_job2, a_name_usa, a_maxLevel`, `a_type` (wg danych: 0 walka wręcz, 1 dystans, 2 magia — ataki i wzmocnienia, 3 pasywna, 9 specjalna), zasięg
(`a_fireRange`), czasy w dziesiątych sekundy (`a_readyTime, a_fireTime, a_reuseTime` — np. Knuckle Spear:
rzut 2,6 s, odnowienie 3 s), opis (`a_client_description_usa`), ikona (`a_client_icon_texid/row/col` →
`SkillBtn{id}.tex`).

**Poziomy umiejętności są w zrzucie** — tabele mają nazwy małymi literami: `t_skilllevel` (5 926) i
`t_magiclevel` (5 960). (Wcześniej błędnie zapisałem, że są puste.)

| Tabela         | Kolumny                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `t_skilllevel` | `a_index, a_level`, **`a_needMP`** (mana), `a_needHP`, `a_durtime` (czas działania), `a_learnLevel` (wymagany poziom postaci), `a_learnSP` (punkty umiejętności), `a_magicIndex1…3` + `a_magicLevel1…3` (efekty) |
| `t_magic`      | `a_index`, typ efektu (`a_type, a_subtype, a_damagetype, a_hittype, a_attribute`)                                                                                                                                |
| `t_magiclevel` | `a_index, a_level`, **`a_power`** (moc), `a_hitrate`                                                                                                                                                             |

Przykład (Knight): Knuckle Spear poz. 1–5: mana 7/8/10/12/14, moc 120/140/175/230/300; Divine Shield
poz. 1–7: mana 20…190, czas działania 300 s, moc 40…500. Jak dokładnie moc przekłada się na obrażenia
(procent ataku? dodatek?) — wzór jest w kodzie serwera.

## Czego brakuje do pełnego 1:1

- statystyki startowe klas i przyrost na poziom (w tym mana),
- wzory: obrażenia (także z umiejętności: jak działa `a_power`), trafienie/unik, szanse ulepszeń +1…+15
  i bonus za każdy „+”.

Źródło: kod serwera albo pełniejszy zrzut — jeśli właściciel go dostarczy. Inaczej proponujemy własne
wartości i oznaczamy je jako własne.

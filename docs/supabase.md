# Plan przeniesienia na Supabase (etap 2)

> To tylko plan. Etapu 2 nie zaczynamy bez zgody właściciela. Kod gry jest już ułożony tak, żeby
> przejście oznaczało **dopisanie `SupabaseGameService`** obok `LocalGameService`, bez przepisywania UI.

## Jak gra jest przygotowana

| Element                                      | Teraz (etap 1)                             | Po przejściu (etap 2)                         |
| -------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| Kontrakt `GameService`                       | `LocalGameService`, zapis w `localStorage` | `SupabaseGameService`, ten sam interfejs      |
| Komendy (`createCharacter`, `reportCombat`…) | asynchroniczne, liczone w przeglądarce     | wywołania funkcji na serwerze                 |
| Zasady (imiona, sloty, nagrody, limit zabić) | czyste funkcje w `src/game/logic/`         | **te same pliki** uruchamiane na serwerze     |
| Walka na ekranie                             | `CombatSession` w przeglądarce             | bez zmian — serwer dostaje tylko wynik        |
| Identyfikatory postaci                       | UUID v4 (`newId()`)                        | `uuid` w bazie — bez konwersji                |
| Dane gry (potwory, exp, drop)                | JSON z bazy LC w bundlu                    | ten sam JSON w funkcjach serwera (lub tabele) |
| Narzędzia dev                                | `GameService.dev`                          | brak dla graczy (ewentualnie rola admina)     |

Zasada: **klient niczego nie zapisuje sam**. Nawet teraz UI zmienia postać wyłącznie przez komendy serwisu,
a nagrody liczy serwis z wyniku walki. Na Supabase te komendy wykona serwer, więc podmiana zapisu
w przeglądarce nic nie da.

## Tabele

```sql
-- konto gracza (1:1 z auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  settings jsonb not null default '{}'::jsonb      -- jakość grafiki, liczby obrażeń
);

create table characters (
  id uuid primary key,
  user_id uuid not null references auth.users on delete cascade,
  name text not null check (name ~ '^[A-Za-z][A-Za-z0-9]{2,15}$'),
  class_id text not null check (class_id in ('titan','knight','healer','mage','rogue','sorcerer')),
  level int not null default 1 check (level between 1 and 99),
  exp bigint not null default 0 check (exp >= 0),
  gold bigint not null default 0 check (gold >= 0),
  zone_id text not null,
  monster_id text not null,
  kills int not null default 0,
  deaths int not null default 0,
  sp bigint not null default 0 check (sp >= 0),        -- 1/10 000 punktu, jak na serwerze LC
  skill_bar int[] not null default '{}',               -- najwyżej 7 skilli używanych w walce
  potion_auto jsonb not null default '{"hp":true,"mp":true}'::jsonb,
  option_progress real not null default 0,            -- sekundy aktywnej gry do następnej opcji (max 600)
  created_at timestamptz not null default now(),
  last_played_at timestamptz not null default now(),
  last_report_at timestamptz not null default now()   -- limit zabić liczony od tej chwili
);
create unique index characters_name_key on characters (lower(name));   -- imiona unikalne w całej grze
create index characters_user_idx on characters (user_id);
```

```sql
create table inventory_items (
  character_id uuid not null references characters on delete cascade,
  item_id int not null,                 -- t_item.a_index
  count int not null check (count > 0),
  primary key (character_id, item_id)   -- stosy; egzemplarze sprzętu z „+N” w M5
);
```

```sql
-- noszony sprzęt i pojedyncze sztuki w torbie: ulepszone, z opcjami, odkryte rzadkie
-- (zwykłe sztuki +0 i nieodkryte rzadkie leżą w inventory_items jako stosy)
create table gear_pieces (
  id uuid primary key,
  character_id uuid not null references characters on delete cascade,
  item_id int not null,                 -- t_item.a_index
  plus int not null default 0 check (plus between 0 and 15),
  options jsonb not null default '[]'::jsonb,   -- [{type, level}] z t_option, losuje serwer
  rare int,                             -- t_rareoption po identyfikacji; null = zwykła / nieodkryta
  slot text check (slot in ('helmet','armor','weapon','pants','shield','gloves','boots',
                            'accessory1','accessory2','accessory3')),  -- null = w torbie
  unique (character_id, slot)
);
```

```sql
create table character_skills (
  character_id uuid not null references characters on delete cascade,
  skill_id int not null,                -- t_skill.a_index
  level int not null check (level > 0),
  auto boolean not null default true,   -- używana sama w walce
  primary key (character_id, skill_id)
);
```

Wyprawa AFK to trzy kolumny w `characters`: `expedition_zone_id`, `expedition_monster_id`,
`expedition_started_at` (null = brak wyprawy); w trakcie wyprawy `report-combat` i `travel` odmawiają. Później: ranking
jako widok.

Odpowiednik w kodzie: `CharacterData` w `src/game/logic/character.ts`, `SaveData.settings` w
`src/game/logic/save.ts`. Pole `activeCharacterId` zostaje w przeglądarce (to stan sesji, nie dane konta).

## Zasady dostępu (RLS)

- `profiles`, `characters`: gracz **czyta** tylko swoje wiersze (`user_id = auth.uid()`).
- Gracz **nie ma** prawa `insert` / `update` / `delete` na `characters`. Zmiany wyłącznie przez funkcje
  serwera (sprawdzają zasady i działają z uprawnieniami serwera).
- `profiles.settings`: gracz może zmieniać tylko tę kolumnę we własnym wierszu.

## Komendy → funkcje serwera

| `GameService`        | Na Supabase                                                 | Co sprawdza serwer                                                                                                                                                               |
| -------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load`               | `select` profilu i postaci                                  | RLS                                                                                                                                                                              |
| `createCharacter`    | funkcja `create_character`                                  | max 4 postacie, imię (wzór, unikalność), klasa                                                                                                                                   |
| `deleteCharacter`    | funkcja `delete_character`                                  | właściciel postaci                                                                                                                                                               |
| `travel`             | funkcja `travel`                                            | strefa i potwór istnieją; od M6 wymagany poziom                                                                                                                                  |
| `reportCombat`       | Edge Function `report-combat`                               | poluje na tego potwora; limit zabić wg czasu serwera; drop (opcje akcesoriów losuje serwer); zdejmuje zgłoszone mikstury; czas gry (max 2 min na zgłoszenie) → opcje na sprzęcie |
| `startAfk`           | funkcja `start_afk`                                         | postać nie jest już na wyprawie; zapisuje miejsce i czas startu                                                                                                                  |
| `claimAfk`           | Edge Function `claim-afk`                                   | czas od `expedition_started_at` wg zegara serwera, max 8 h; zużycie mikstur liczy serwer                                                                                         |
| `sellItems`          | funkcja `sell_items`                                        | postać ma te przedmioty; cena z danych gry × stawka sklepu                                                                                                                       |
| `learnSkill`         | funkcja `learn_skill`                                       | klasa, poziom postaci, wymagane skille, SP; nie w trakcie wyprawy                                                                                                                |
| `setSkillAuto`       | funkcja `set_skill_auto`                                    | skill jest nauczony; nie w trakcie wyprawy                                                                                                                                       |
| `setSkillBar`        | funkcja `set_skill_bar`                                     | najwyżej 7 nauczonych aktywnych skilli                                                                                                                                           |
| `setPotionSlot`      | `update characters set potion_slots`                        | właściciel                                                                                                                                                                       |
| `equipItem`          | funkcja `equip_item`                                        | postać ma przedmiot; klasa i poziom; nie w trakcie wyprawy                                                                                                                       |
| `unequipItem`        | funkcja `unequip_item`                                      | slot nie jest pusty                                                                                                                                                              |
| `upgradeItem`        | Edge Function `upgrade-item`                                | Heaven Stone w torbie; **szansę losuje serwer**                                                                                                                                  |
| `exchangeStones`     | funkcja `exchange_stones`                                   | 10 Smelting Stone na każdy Heaven Stone                                                                                                                                          |
| `buyItem`            | Edge Function `buy-item`                                    | przedmiot jest w ofercie (progi wokół poziomu, towary strefy); złoto                                                                                                             |
| `sellGear`           | funkcja `sell_gear`                                         | postać ma te sztuki (wiele naraz)                                                                                                                                                |
| `identifyItems`      | Edge Function `identify-items`                              | lupy w torbie (jedna na sztukę); **szansę lupy, zestaw i opcje losuje serwer**; nie w trakcie wyprawy                                                                            |
| `updateSettings`     | `update profiles set settings`                              | RLS                                                                                                                                                                              |
| `resetSave`          | funkcja `delete_all_characters`                             | właściciel                                                                                                                                                                       |
| `setActiveCharacter` | tylko w przeglądarce (+ `last_played_at`, `last_report_at`) | —                                                                                                                                                                                |
| `dev.*`              | brak (albo tylko rola admina)                               | —                                                                                                                                                                                |

`report-combat` i `claim-afk` to Edge Functions w TypeScripcie, bo korzystają wprost z
`src/game/logic/rewards.ts`, `afk.ts`, `loot.ts`, `progression.ts` i danych gry — te same pliki co
w przeglądarce. Prędkość gry jest tam zawsze 1, a drop losuje serwer. Później `report-combat` może też
porównywać zgłoszone tempo z `measureHuntRate` (czy postać w ogóle może tak szybko zabijać).

## Zabezpieczenia

- Limit zabić: `floor(czas od ostatniego zgłoszenia / 3,2 s) + 2` (patrz `docs/balance.md`). Nadmiar
  nie jest wypłacany.
- Nagrody, poziomy i złoto liczy tylko serwer. Klient dostaje gotowy wynik.
- Walka na ekranie zostaje w przeglądarce (to gra idle — pojedynczych ciosów nie weryfikujemy),
  ale jej wynik i tempo są ograniczone przez serwer.
- Klucz `anon` w przeglądarce jest publiczny z założenia — bezpieczeństwo daje RLS i funkcje serwera.

## Do decyzji właściciela przed etapem 2

1. Logowanie: e-mail (magic link), Google, czy oba?
2. Zapisy z przeglądarki testerów: przenosić przy pierwszym logowaniu (z kontrolą serwera), czy start od zera?
3. Region projektu Supabase (UE — np. Frankfurt).

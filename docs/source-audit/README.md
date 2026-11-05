# Audyt techniczny i źródła odniesienia Last Chaos

Analiza z 2026-11-02 dotyczy IdleLC w punkcie `c9944c92cacfc50595dbfc8bbd085b64cf5e4048` oraz trzech archiwów przekazanych przez właściciela. Raporty zachowują ustalenia sprzed wdrażania zmian. Bieżący stan prac i kolejność kontynuacji opisuje [dokument przekazania](../development-handoff.md); ustalenia projektowe i otwarte różnice opisuje [rejestr decyzji](../design-decisions.md).

Źródła serwera rozstrzygają wykonywane reguły gry. Źródła klienta wyjaśniają formaty zasobów, animacje i prezentację. Pola podglądu klienta ani nazwy skilli nie zastępują serwerowego wykonania efektu. Kod z 2018 r. nie dowodzi automatycznie zachowania konkretnego prywatnego serwera z 2015 r.

## Pochodzenie i możliwość powtórzenia analizy

| Prefiks | Materiał                                                                                                                                                                                                                                                                                                              | Rozmiar archiwum | SHA-256                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | ------------------------------------------------------------------ |
| `A/`    | [Czytelny klient 2015](https://drive.google.com/file/d/1jclE99G1GscMocwveuw7oavgyUj-P2tk/view), katalog `2015 client/` zawierający `Data/` i `Fonts/`                                                                                                                                                                 |  1 871 819 153 B | `a8372e0ce360713d50ac2368400434d3e82e4d0f36f859f71e62c9bdcac6cc69` |
| `S/`    | [Źródła serwera November 2018](https://drive.google.com/file/d/1OjlbpJG1FE6ZfzjGhwpCW2CAPwM7-6AJ/view), katalog `lastchaos-source-server-november-2018/`                                                                                                                                                              |     30 377 418 B | `f7eae4182253801ab8d7e1b0f2938d4cc8bd5124eabbd9b96de70777d6e034b5` |
| `C/`    | [Źródła klienta November 2018](https://drive.google.com/file/d/1U719ODT3MzKC2pvSwPapI7hQXtKLQrI1/view), katalog `lastchaos-source-client-november-2018/`                                                                                                                                                              |     39 451 071 B | `f97178101ed3238f740574fb95d2bfc70c79c3c963c8e74ed67582e0823fe36f` |
| `D/`    | [Zrzut bazy luty 2016](https://drive.google.com/file/d/133EYk_OXU3qxzKu8OpDTw1wlf_NH5ffE/view), `lastchaos-database-master/newproject_data.sql` (54 828 277 B, SHA-256 pliku SQL `0cae2afd637966dd365f22a2795ba5402c29061aa83d01b84e6a8f7ce031d85d`); dodany 2026-11-05, opis w [db-2016-dump.md](../db-2016-dump.md) |     10 376 903 B | `7e95f197f8313c199925e2e6712f8a686b9e8192aa570d9acf5347b7b07ce4d1` |
| `I/`    | Katalog główny tego repozytorium, stan audytu `c9944c9`                                                                                                                                                                                                                                                               |                — | —                                                                  |

Przykład cytowania: `S/GameServer/PC.cpp:1420` oznacza linię pliku wewnątrz wskazanego archiwum serwera. Same `GameServer/` i `ShareLib/` również odnoszą się do `S/`. `Engine/` odnosi się do `C/`. Numery linii odnoszą się do wskazanych, niezmienionych archiwów, a nie do przyszłych forków źródeł. Nie umieszczamy surowych klientów, źródeł C++, archiwów ani zrzutów bazy w repozytorium gry. Skonwertowane zasoby i dane produkcyjne są wersjonowane zgodnie z decyzją właściciela.

W środowisku audytu pliki robocze znajdowały się w `/workspace/client-audit` i `/workspace/original-source-audit`, poza checkoutem. Te lokalizacje nie są zależnością buildu ani trwałą częścią projektu. Pomocnicze skrypty i zrzuty diagnostyczne wymieniane w raportach nie są dołączonymi narzędziami produkcyjnymi; ich wyników nie należy mylić z odtwarzalnymi testami CI.

## Mapa raportów

| Raport                               | Zakres i znaczenie                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| [Zasoby klienta](assets.md)          | Co rzeczywiście odzyskano w próbach, zgodność rigów, ikony, GUI, ograniczenia animacji i efektów            |
| [Statystyki](stats.md)               | STR/DEX/INT/CON, bazowe HP/MP, przyrosty klas, kolejność `InitStat`/`CalcStatus`, ograniczenia próbek       |
| [Walka](combat.md)                   | Osiągalne funkcje `_Adult`, trafienie, sześć typów trafień, kanały ataku/obrony, damage, NPC, żywioły i PvP |
| [Umiejętności](skills.md)            | Enumy magic, READY/FIRE, koszty, trafienie efektów, assisty, ticki, błędne interpretacje obecnego eksportu  |
| [Przedmioty](items.md)               | Ekwipunek, opcje, rare, lupa, plusy, kamienie, ograniczenia poziomu i świadome odstępstwa IdleLC            |
| [Nagrody](rewards.md)                | EXP/SP, pełne sloty dropu, złoto, mikstury i ekonomia; brakujące dane wejściowe                             |
| [Formaty klienta](client-formats.md) | MESH/TEX, `Effect.dat`, rozmiary typów C++, framing i granice dotychczasowej diagnostyki                    |

## Najważniejsze rozstrzygnięcia

1. **Odzyskanie grafiki wymaga poprawy czytników.** MESH v17 ma kolejność liczników `colors, floats, textures, texCoords`, a danych `textures, flags, colors, floats, texCoords`. Poprawne EOF i geometria nie dowodzą poprawnego materiału. W TEX ciąg `FRMC` może wystąpić w pikselach FRMS; globalne wyszukiwanie sygnatur nie rozpoznaje granic sekcji.
2. **Formuły walki są dostępne, ale obecny model jest uboższy od oryginału.** Oryginał rozdziela atrybuty, melee/range/magic, defense/resist, ratingi oraz składniki broni i postaci. Jednorazowa podmiana wzoru `A²/(A+D)` bez rozszerzenia modelu nie zapewni zgodności.
3. **Są potwierdzone błędne interpretacje enumów.** `BLOOD` to krwawienie, `CONFUSION` jest osobnym stanem, `MAXHP_450` dotyczy HP, `SKILLSPD` przygotowania castu, a `DEADLY` nie jest mnożnikiem critical damage. Każda korekta wymaga sprawdzenia całego przepływu i testu zachowania.
4. **Nie każda różnica jest błędem.** Bezpieczne ulepszanie, automatyczne opcje, rozszerzenia rare, AUTO, wyprawa AFK, ograniczenie stref i poziomu są ustaleniami projektu. Nie wolno ich kasować pod hasłem „zgodność 1:1”.
5. **Brakuje pełnej bazy SQL.** Archiwa źródeł nie zawierają zrzutu danych gry. Obecny eksport gubi m.in. puste sloty dropu, część szans trafienia magii, flag i warunków. Kod odczytu tabel nie odtwarza utraconych wartości.
6. **Nie ma jeszcze oryginalnego renderera FX.** Odczytano strukturę końcowych grup `Effect.dat`; bez definicji cząstek, efektów, tagów, transformacji i blend modes nie odtworzono wyglądu efektów.

## Granice pewności

- Nie kompilowano ani nie uruchamiano pełnego oryginalnego klienta lub serwera. Uruchomiono lokalne czytniki i mały wyciąg tabel klas C++; nie jest to porównanie z działającym GameServer.
- Nie ustalono faktycznego profilu regionalnego i wszystkich flag serwera odniesienia. Przykładowo `DOUBLE_ATTACK` różni się między dostarczonymi nagłówkami USA i KOR. Funkcja obecna w źródle nie musi być włączona w każdym wydaniu.
- Nie potwierdzono zgodności wszystkich danych z 2015 i 2018 r. Numeracja opcji, zawartość bazy i nazwy efektów wymagają kontroli wersji, szczególnie dla prywatnych klientów.
- Weryfikowano programowo wszystkie 283 wybrane źródła wyposażenia, lecz wizualnie tylko reprezentatywne próbki i odzyskane potwory. Nie sprawdzono wszystkich kombinacji wyposażenia, klatek animacji i urządzeń.
- Pozostają nieobsługiwane warianty formatów, m.in. część starszych MESH i morph maps. Parser obsługujący badany plik nie jest pełnym portem silnika.
- Testy jednostkowe IdleLC używają danych zastępczych (`VITE_LC_DATA=0`), dlatego ich sukces wymaga uzupełnienia testem rzeczywistej gry na wygenerowanych danych i zasobach.

Te ograniczenia wyznaczają kolejne zadania; nie uzasadniają zastępowania brakujących danych domysłami.

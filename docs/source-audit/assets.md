# Odzyskanie zasobów z czytelnego klienta 2015

Punkt odniesienia: IdleLC `c9944c9`. Pochodzenie archiwów i prefiksy `A/C/S/I` znajdują się w [indeksie](README.md). Poniższe wyniki dotyczą prób audytowych przed wdrożeniem; aktualny zakres wersji produkcyjnej opisują [przekazanie prac](../development-handoff.md) i changelog w katalogu głównym.

## Co potwierdzono

| Zasoby                        | Wynik prób                                                         | Co wynik rzeczywiście oznacza                                                         |
| ----------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Wyposażenie z płaskim kolorem | 258/258 źródeł dało kompletne modele z teksturami                  | Poprzedni kolor z ikony można zastąpić odzyskanym materiałem po regeneracji GLB       |
| Modele zastępcze wyposażenia  | 19/19 ma właściwe siatki, tekstury i kości                         | Trzeba zmienić jednocześnie model oraz manifest; nie wystarczy dodać pliku            |
| Rękawice Cube Explorer        | 6/6, po jednej parze na klasę                                      | `ti/ni/hw/ma/ro/so_hn_017-1`, przedmioty 5979/5986/5994/6001/6008/6015                |
| Potwory                       | Elder Drake, oryginalny Cursed Weaver i Cursed Lich                | Poprzednie wymuszone warianty „2” nie są konieczne dla czytelnego źródła              |
| Ikony przedmiotów             | Pełny arkusz ma mapowania 2052/2052                                | Z 91 poprzednio brakujących IDs 86 ma grafikę, pięć wskazuje szary placeholder        |
| Ikony umiejętności            | Pełny arkusz ma mapowania 119/119                                  | Uzupełniono 12 IDs; część problemu wynikała ze starego manifestu, a nie zaszyfrowania |
| Animacje                      | Cztery z pięciu brakujących klipów istnieją i pasują do rigów      | `hw_s_skill_02`, `so_summon`, `so_stoneskin`, `so_vconverstion`                       |
| GUI                           | Czytelne `ActionBtn0`, `NamePopup`, `Cashshop`, `CostumeInventory` | Obecność atlasu nie ustala jeszcze prawidłowego wycinka i zastosowania                |
| Roślinność Juno               | 17 modeli trawy konwertuje się bez braków                          | Nadal potrzebne rozmieszczenie, integracja i pomiar kosztu sceny                      |
| FX                            | `Effect.dat` jest czytelnym plikiem EFTB                           | Nie oznacza gotowego importera i renderera oryginalnych efektów                       |

Pięć szarych ikon to IDs 11037 i 11039–11042. Pełne mapowanie nie oznacza unikatowej grafiki dla każdego ID. Nie należy ogłaszać „91 odzyskanych ilustracji”.

## Dlaczego sam dodatkowy katalog klienta nie wystarcza

Dotychczasowy `scripts/lc/convert-lc.mjs` wymuszał zamienniki Cursed Lich/Weaver oraz zastępcze animsety Knighta, Rogue i Sorcerera. Konwerter musi najpierw spróbować czytelnego oryginału, a zamiennik stosować po rzeczywistym niepowodzeniu. Regeneracja musi aktualizować pasujące manifesty, hashe URL i nazwy klipów.

Drugą przeszkodą są czytniki opisane w [raporcie formatów](client-formats.md). Najpierw trzeba poprawić układ materiału MESH i rozpoznawanie FRMS/FRMC w TEX. Próba z wcześniejszym, częściowo poprawionym parserem MESH dawała prawidłową geometrię i EOF, lecz błędne UV/flags. Wszystkie 283 konwersje powtórzono po sprawdzeniu zapisu i odczytu w `C/Engine/Ska/Mesh.cpp:2231–2360,3322–3366`.

Nie można też traktować `--out` jako pełnej izolacji: w wersji bazowej inne wyjścia, w tym manifest klipów, ikony i GUI, korzystały ze stałych ścieżek repozytorium. Próby audytu uruchamiano przez funkcje pomocnicze poza checkoutem. Przed nową konwersją należy sprawdzić zakres zapisów aktualnej wersji CLI i końcowy diff.

## Modele i szkielety

Wszystkie 283 wybrane źródła wyposażenia przeszły ścisłą konwersję bez brakujących plików, nieczytelnych części, obcych kości i zastępczych kolorów. Nazwy kości oraz lokalne translacje i rotacje odpowiadały sześciu obecnym ciałom klas. Macierzy inverse bind z zoptymalizowanego GLB nie należy porównywać bezpośrednio z SKEL, ponieważ optymalizacja wnosi kompensację kwantyzacji.

Elder Drake: `A/Data/Monster/Wyvern/Wyvern.smc`, trzy części, 42 kości i sześć wymaganych klipów. Cursed Weaver: `A/Data/Monster/CusedWever/cused_wever.smc`, siedem części, w tym miecz, 68 kości i osiem klipów. Cursed Lich: `A/Data/Monster/CusedRich/cusedrich.smc`, sześć części, 65 kości i siedem klipów. Próbne modele odtworzono w Chromium/WebGL2 bez błędów strony i ładowania. Nie zastępuje to sprawdzenia nowo wygenerowanych plików w rzeczywistej scenie gry.

Nie należy przy okazji konwertować wszystkich 212 modeli potworów ani odblokowywać kolejnych stref. Celem tego etapu są brakujące zasoby już używanej gry.

## Animacje i GUI

Wszystkie sześć głównych zestawów BA w archiwum jest czytelnym ANIM v14. Główne zestawy zawierają odpowiednio 137 klipów Knighta, 135 Titana, 145 Healer, 165 Mage, 146 Rogue i 125 Sorcerera. Wstępny heurystyczny odczyt `skills.lod` dawał 78 mapowań wobec 72 w punkcie odniesienia. **Późniejszy czytnik zgodny z `C/Engine/Entities/Skill.cpp` zastępuje ten wynik:** odczytuje 1787 rekordów z kontrolą checksum i EOF, a dla danych IdleLC daje 75 mapowań. W integracji zachowano dodatkowo cztery wcześniejsze mapowania starszego eksportu, których rekordy klienta 2015 są puste (IDs 10/11/23/51): docelowy manifest ma 79 wpisów. Nie należy bez kontroli usuwać działających mapowań tylko dlatego, że plik starszego klienta jest inny.

`ti_skill_10` nie występuje w żadnym z 1086 zestawów BA archiwum. Istnieje `ti_skill10`, ale nie potwierdzono równoważności i nie należy automatycznie tworzyć aliasu. Odzyskanie animacji przywołania nie implementuje samo w sobie mechaniki summon.

Spośród 31 dotychczasowych wycinków GUI 29 mieści się w atlasach i daje bajtowo identyczny wynik. Dwa wycinki paska ładowania przekraczają granice źródła: `LoadingBar.tex` ma 16×16, a `ProgressBar.tex` 64×32. Potrzebna jest poprawa wycinków i sposobu skalowania w UI, a nie masowa wymiana identycznych obrazów.

`ActionBtn1.tex` oraz `FontGerman*.tex` nie występują w rozpakowanym materiale ani spisie ZIP. Dostępność innych bitmapowych fontów nie dowodzi ich zamienności. `NamePopup` zawiera dekoracje i oznaczenia; bez ustalenia roli w kodzie klienta nie należy uznawać całego atlasu za ramkę nicku.

## Effect.dat i następny etap

Plik ma 3 555 560 bajtów. Czytnik diagnostyczny potwierdził końcową sekcję EEGM: 3413 grup, 11 919 kluczy efektów, 11 892 klucze tagów, poprawne zakresy indeksów i dokładne EOF. Wstępny skan ścieżek znalazł 1935 unikatowych odwołań DFNM, z czego 1909 daje się odnaleźć w archiwum; nie jest to pełna walidacja zależności efektów.

Pozostają definicje EPGM/EEFM, emitery, procesory, transformacje, trajektorie, shadery, blending i attachmenty. Sam eksport nazw lub czasów grup nie odtwarza wyglądu. Obecne `SkillEffects`, `UpgradeAura` i `TitleAura` są własnymi efektami używającymi wybranych tekstur klienta. Wierny renderer LC wymaga osobnego etapu i porównań wizualnych.

Surowy materiał został odczytany bez wykonywania dostarczonych programów. Rozpakowano 43 856 plików z Data i Fonts z kontrolą CRC. Pełna inspekcja wizualna wszystkich modeli, animacji, map i efektów nie została wykonana.

## Stan po wdrożeniu 2026-11-02

Wygenerowano 292 cele z `scripts/lc/batches/recovery-2015.json`, 0 nieoczekiwanych braków:
283 modele sprzętu, sześć klas i trzy potwory. Jedyny jawny wyjątek to wcześniejsze odwołanie
`ti_skill_10`. Kontrola wszystkich GLB potwierdziła 401 tekstur, 434 siatki, skończone wartości
accessorów, zgodność nazw kości oraz hashe wszystkich plików obu manifestów.
Wynik: [recovery-validation.json](recovery-validation.json); odtworzenie bez surowego klienta:
`npm run verify-lc-recovery -- --report`.

Wydobyto i zintegrowano 33 wycinki GUI: Titles z ActionBtn0 (akcja 49), ramki nicku i tytułu
z NamePopup oraz poprawne trzy części loading według GameMP/Map.cpp. Tło tytułu korzysta
z oryginalnej szarej grafiki; dokładne mnożenie przez kolor tytułu pozostaje do porównania.
Cashshop/CostumeInventory i bitmapy fontów są dostępne, ale nie zostały arbitralnie podstawione
w responsywnym podglądzie postaci ani w całym UI.

Roślinność i drobne obiekty Juno dołączono poleceniem `recover-lc-props`:
41 → 56 modeli, 963 → 5151 instancji (+4188). Stare wpisy modeli i instancji pozostały
dokładnym prefiksem manifestu; wszystkie wcześniejsze geometrie, transformacje, materiały
i zakodowane tekstury są identyczne po odczycie wynikowego GLB. Zachowano 38 aren, wysokości,
maski i tekstury terenu. Nie podmieniono 19 różniących się tekstur drzew/budynków z wersji 2015.
GLB rośnie z 969508 do 1185424 bajtów. Drugie uruchomienie jest no-op.
`st_sheaf02` nadal wymaga odczytu starszego MESH16 i nie jest nową regresją.

Szacowany górny narzut nowych propsów przy 120 m zasięgu na arenę: 15 draw calls,
596 instancji i 23477 trójkątów, około 306 KB macierzy. To statyczne oszacowanie, nie pomiar
FPS telefonu; płynność na urządzeniu właściciela pozostaje do sprawdzenia.

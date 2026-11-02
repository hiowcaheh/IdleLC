# Weryfikacja formatów klienta: Effect.dat i materiały MESH v17

> Raport źródłowy z analizy 2026-11-02, porównujący stan IdleLC `c9944c9` przed wdrożeniem. Opisy „obecnie”, „bez zmian” i numery linii IdleLC dotyczą tego punktu odniesienia. Aktualny stan wdrożenia: [przekazanie prac](../development-handoff.md). Pochodzenie i prefiksy źródeł: [indeks audytu](README.md).

Zakres: niezależne sprawdzenie wskazanych czytników C++2018 i trzech reprezentatywnych assetów2015. Nie uruchamiano oryginalnych binariów ani nie zmieniano repozytorium/oryginalnych danych. `C` = `główny katalog archiwum klienta 2018`, `A` = katalog klienta 2015 wskazany w indeksie, `R` = `materiał lokalny audytu: reference`.

## Wynik

**Metadane końcowej sekcji grup Effect.dat są potwierdzone strukturą i niezależnym odczytem; pełny system FX pozostaje nieodtworzony. Materiały wcześniejszego helpera mesh mają błędną kolejność pól — poprawne EOF/geometria nie wykrywały zamiany UV-index i flags.** Literalny układ2018 działa na wszystkich trzech próbkach2015 i daje prawidłowy indeks UV0.

## Effect.dat: zgodność diagnostyki z C++

Główny reader (`C/Engine/Effect/EffectCommon.cpp:165–190`) wymaga kolejno `EFTB`, `EPGM`/particle manager, `EEFM`/effect manager, `EEGM`/group manager, `EFTE`. Diagnostyka `R/read_effect_groups.py` **nie przechodzi przez cały ten ciąg strukturalnie**: czyta nagłówek pierwszej particle group, a następnie wyszukuje jedyne wystąpienie `EEGM` w konkretnym pliku. Jest to uzasadniony ograniczony test tego assetu, nie uniwersalny parser całego Effect.dat.

| Pole/struktura                                                                                                                                   | Źródło C++                                          | Ocena diagnostyki                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `PGMG`, version1, `DWORD` count                                                                                                                  | `C/Engine/Effect/CParticleGroupManager.cpp:111–132` | Poprawne:1 bajt wersji,32-bit count.3520 to deklarowany count, nie liczba kompletnie zdekodowanych particle definitions. |
| `PTGR`, version1, nazwa przez `GetLine_t`, texture przez `CTFileName`, render/blend, MEX width/height, INDEX column/row, process count           | `C/Engine/Effect/CParticleGroup.cpp:150–195`        | Nagłówek pierwszego rekordu poprawny; nie są czytane process/emitter/absorption. MEX to integer, nie float.              |
| `EGMG`, version1, DWORD group count                                                                                                              | `C/Engine/Effect/CEffectGroupManager.cpp:130–151`   | Poprawne.                                                                                                                |
| `EFGR`, version1, nazwa; `EGEK`, count i `(FLOAT start, line effectName)`; `EGTK`, count i `(FLOAT time, INDEX effectKey, line tagName)`; `EGEN` | `C/Engine/Effect/CEffectGroup.cpp:466–506`          | Kolejność poprawna; potem `EFTE` i dokładne EOF.                                                                         |

Primitives: `UBYTE` = unsigned byte; `FLOAT` =32-bit float; `MEX=SLONG` i `INDEX=long int` są **signed32 w historycznym Windows ABI**, `DWORD` unsigned32 (`C/Engine/Base/Types.h:41–50,75–77,110–116`). Nie należy ustalać szerokości przez współczesne Linux `sizeof(long)`; na LP64 byłoby64. W diagnostyce MEX/INDEX są czytane jako unsigned32: te same bity i poprawny wynik dla obecnych nieujemnych wartości, ale do ogólnego parsera potrzeba signed `<i` i walidacji zakresu. Wszystkie odczytane tag INDEX są tu nieujemne.

`CTFileName` bez dictionary zaczyna się od `DFNM`, po którym jest CTString z **signed INDEX length** i bajtami bez NUL (`C/Engine/Base/FileName.cpp:115–132`; `CTString.cpp:521–538`). Założenie diagnostyki pasuje do sprawdzonego pierwszego texture filename. Nie zweryfikowano wariantu z włączonym dictionary.

`GetLine_t` usuwa **każdy** CR i kończy na LF; overload CTString ma bufor1024, limit1023 (`C/Engine/Base/Stream.cpp:574–629`). Helper szuka LF w4096 i usuwa tylko końcowe CR/LF, po czym dekoduje CP949 z replacement. To nie jest dokładna implementacja dla dowolnych bajtów. Dla aktualnej sekcji różnica nie występuje: wszystkie linie są ASCII, najdłuższa ma33 bajty, brak NUL i wewnętrznych CR; liczba replacement characters=0. Kodowanie CP949 nie zostało przez to potwierdzone dla tekstów nie-ASCII.

## Effect.dat: niezależne walidacje danych

Asset `A/Data/Effect/Effect.dat` ma **3 555 560 bajtów**. Sekcja `EEGM` zaczyna się na offset **2 919 081**, ma636479 bajtów do końca; `EEGM` i `EEFM` występują po jednym razie. Niezależny odczyt framingu z assetu potwierdził wynik istniejącego JSON:

- **3413 grup,11919 effect keys,11892 tag keys**, wszystkie group record versions=1, końcowe `EFTE` dokładnie przy EOF.
- Nazwy grup unikalne i niepuste; effect names/tag names niepuste. Dwie grupy mają0 effects, trzy mają0 tags. To nie błąd framingu — `Start()` i tak odrzuca pusty zestaw (`C/Engine/Effect/CEffectGroup.cpp:181–185,241–244`).
- Wszystkie czasy finite i≥0; effect start range **0…12,6999998093**, tag time range **0…9,5**. Są to surowe FLOAT32; nie ma mnożenia `/10` w czytniku. Runtime porównuje je z czasem względem startu grupy i własnym `m_fSpeedMul` (`CEffectGroup.cpp:315–353`). Nie wyprowadzano z nich czasu trafienia mechaniki serwerowej.
- Każdy tag `effectKey` mieści się w `[0,effectCount)` swojej grupy; zakres zapisanych indeksów0…77; maksymalnie78 effect keys i78 tag keys w grupie. Brak wymogu sortowania na poziomie readera — runtime iteruje wszystkie wpisy.

Ograniczenie semantyczne: `AddEffect()` wymaga zarejestrowanej nazwy w **CEffectManager** i może odrzucić wpis (`C/Engine/Effect/CEffectGroup.cpp:63–82`); `AddTagForEffect()` wymaga istniejącego effect key (`:85–103`). Ponieważ `EEFM` nie jest dekodowane, walidacja indeksów dotyczy **surowych rekordów**, nie gwarantuje pełnej zgodności runtime po odrzuceniu nieznanych efektów. Nie sprawdzono istnienia wszystkich efektów, modeli, tekstur, emitterów, processów, ścieżek, attachmentów ani tagów modelu. Samo dopasowanie nazwy timeline nie odtwarza wyglądu FX, materiałów, blend modes ani trajektorii.

Pierwszy particle header: `(PTC)Balrog_start_hit`, texture `Data\\Effect\\Particle\\FX_pe_sam00.tex`, renderType0, blendType206, width32,height32,columns0,rows0,processCount1. Te wartości są zgodne z kolejnymi typami readera; bez dalszego decoder/renderera nie przypisuję blend206 kompletnej implementacji graficznej.

## MESH v17: źródło rozstrzyga kolejność materiału

`C/Engine/Ska/Mesh.cpp:3–8,2081–2090` rozróżnia v16 i v17; badane pliki to v17. `Read_t_new` czyta:

1. Header shader counts: **colors,floats,textures,texcoords** (`:2231–2239`).
2. Po shader name: **texture IDs,flags,colors,floats,texcoord indices** (`:2325–2360`).

`Write_t_new` niezależnie zapisuje dokładnie ten sam układ (`:3322–3366`). Całkowitoliczbowe pola obfuscation XOR przesuwają checker; float params nie są XOR-owane (`:2041–2070,2348–2353`). Wcześniejszy `materiał lokalny audytu zasobów: mesh/mesh-counts-staging.mjs:43–53` zgadywał header `texcoords,floats,textures,colors`, a body `textures,texcoords,colors,floats,flags`. Kiedy ctColors=ctTexCoords=1 i ctFloats=0 lub1, ilość bajtów i liczba przesunięć klucza mogą się zgadzać mimo błędnego znaczenia.

W audycie zapisano ograniczony helper mesh-source-2018-staging.mjs (`reference/mesh-source-2018-staging.mjs`, pomocniczy materiał diagnostyczny poza repozytorium): taki sam eksport `parseMesh()` i pola wyniku, zmieniona kolejność wyłącznie powyższych pól względem wcześniejszego bounded helpera. To staging poza repo; pozostałe ograniczenia dawnego decoder pozostają, m.in. brak morph maps i uproszczenia obsługi różnych meshów. Nie jest to pełny port CMesh.

| Surowy plik względem `A/Data`        | Bajty/EOF obu helperów | Count words przy pierwszym materiale | Shader                   | Stary helper        | Literalny układ2018 |
| ------------------------------------ | ---------------------: | ------------------------------------ | ------------------------ | ------------------- | ------------------- |
| `Monster/CusedWever/c_wever_head.bm` |              5174/5174 | offset3635: `[1,0,1,1]`              | `Add.sha`                | UV`[1]`,flags0      | UV`[0]`,flags1      |
| `Character/Knight/ni_face_000.bm`    |            19026/19026 | offset13399: `[1,1,2,1]`             | `NormalMap.sha`          | UV`[1]`,flags0      | UV`[0]`,flags1      |
| `Monster/Harpy/Harpy.bm`             |            65867/65867 | offset44867: `[1,1,2,1]`             | `Default.sha`,2 surfaces | obie UV`[1]`,flags0 | obie UV`[0]`,flags1 |

W każdym przykładzie jest jedna rzeczywista UV map. Runtime używa **zero-based indeksu**, sprawdza `index < uvMaps.Count()` i dla niewłaściwego wpisu ustawia bufferID=−1 (`C/Engine/Ska/RMRender.cpp:3453–3468`). Stare `[1]` jest więc nieprawidłowe; nowe `[0]` prawidłowe. Colors pozostają `0xffffffff`, float values pozostają odpowiednio `[]`, `[1]`, `[1]`, tekstury i geometria nie zmieniają się. Definicje shaderów potwierdzają oczekiwane counts: Add ma1texture/1UV/1color/0float (`C/Shaders/AddShader.cpp:4–7`), NormalMap i Default2/1/1/1 (`NormalMapShader.cpp:15–18`, `DefaultShader.cpp:15–18`).

To silniejszy dowód **błędnego dawnego domysłu o polach** niż wariantu2015 vs2018 dla tych trzech plików. Nie dowodzi jednego układu dla dowolnego assetu lub wersji; także nie dowodzi wiernego wyglądu GLB. Wcześniejsze odzyskanie geometrii/skin weights pozostaje użyteczne, ale zapisane tam wnioski `texCoords=[1],flags=0` i deklaracje poprawności ogólnej semantyki materiałów wymagają korekty. Root może ponownie sprawdzić szerszy zestaw283 gear meshes z zapisanym helperem; ten raport sam nie przypisuje wyniku całemu zestawowi.

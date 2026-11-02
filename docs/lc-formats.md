# Formaty plików klienta LC (2015)

Klient LC używa systemu modeli SKA z Serious Engine. Opis zweryfikowano teraz z serializerami
oryginalnego klienta z listopada 2018 oraz pełnym jawnym archiwum 2015. Skan odczytał do EOF
**12 493 siatki MESH17** i poprawnie zdekodował **11 798 tekstur** (w tym 3366 DXT3).
Pozostało 122 siatki starszych wersji 11/16 i 16 proceduralnych tekstur FXDT, których konwerter
jawnie nie obsługuje. Wcześniejsza próbka 76 siatek nie wykryła pomylonej kolejności materiałów.
Konwerter produkcyjny: `scripts/lc/`; stary prototyp Python w `tools/lc/` nie stanowi specyfikacji.
Pochodzenie, hashe i granice zgodności: [audyt źródeł](source-audit/README.md).

Liczby całkowite są w little-endian. `string` = `u32 długość` + bajty (bez zera na końcu).

## Szyfrowanie: strumień kluczy XOR

LC nie szyfruje całych plików, tylko **wybrane liczby całkowite** (liczniki, flagi). Każda kolejna taka liczba
(`xint`) jest XOR-owana kolejnym kluczem. Klucz to 4 bajty; po każdym użyciu **każdy bajt klucza rośnie
o stały krok** (mod 256, bez przeniesień między bajtami).

| Format          | Klucz startowy (bajty LE) | Krok   |
| --------------- | ------------------------- | ------ |
| Siatka `.bm`    | `65 48 35 1e`             | `0x59` |
| Tekstura `.tex` | `3e 3d 14 12`             | `0x43` |

Floaty, stringi, indeksy trójkątów i wagi są jawne. Odczyt musi zachować dokładną kolejność `xint`,
bo każdy pominięty lub dodatkowy odczyt rozjeżdża strumień kluczy.

## Siatka `.bm` (MESH v17, wersja LC)

Oryginalny Serious Engine ma wersję 16. LC: wersja 17, liczniki przeniesione na początek LOD-u i zaszyfrowane.

```
"MESH"  u32 version (=17)  u32 size (= długość pliku − 8)
xint ctLods
dla każdego LOD:
  xint ctVertices, ctWeightMaps, ctUVMaps, ctVertices (powtórzone), ctSurfaces, ctMorphMaps
  string sourceFile          float maxDistance          xint flags
  float3[ctVertices] positions                          (metry, Y w górę, model patrzy w +Z)
  float3[ctVertices] normals
  ctUVMaps × { string name ("Texture"),  float2[ctVertices] uv }
  ctSurfaces × {
    xint firstVertex, xint vertexCount, xint triangleCount
    u16[3 × triangleCount] triangles   ← indeksy WZGLĘDNE: dodać firstVertex!
    string name
    xint unknown (0/1)
    xint paletteCount, u8[paletteCount] bonePalette     (paleta kości do skinningu GPU)
    xint hasShader
    jeśli hasShader:
      xint ctColors, xint ctFloats, xint ctTextures, xint ctTexCoords
      string shader ("Shaders\Default.sha", "Shaders\NormalMap.sha", "Shaders\Color.sha", …)
      string[ctTextures] textures     (nazwy kluczy z .smc; dla NormalMap: [diffuse, normal])
      xint shaderFlags   xint[ctColors] (RGBA)   float[ctFloats]   xint[ctTexCoords] (indeksy UV od 0)
  }
  ctWeightMaps × { string boneName, xint count, (u32 vertex, float weight)[count] }   (pary jawne)
  morph maps — w otrzymanych plikach zawsze 0, nieobsłużone
  u8[8 × ctVertices]  dane skinningu GPU: 4 indeksy do palety powierzchni + 4 wagi (0–255)
```

Do glTF bierzemy wagi z `weightMaps` (nazwa kości → wierzchołek, waga): top 4 wpływy na wierzchołek,
znormalizowane.

**Kierunek trójkątów nie jest jednolity:** w części plików (np. twarz Sorcerera `so_face_000`, wilki, jelenie,
jaguary, ok. 160 modeli sprzętu) trójkąty są zapisane odwrotnie, a normalne i tak wskazują na zewnątrz. Klient
rysuje je poprawnie, ale w glTF (odrzucanie tylnych ścian) taka powierzchnia znika od przodu albo wygląda „od
środka”. Konwerter (`outwardIndices` w `model.mjs`) odwraca trójkąty powierzchni, której większość trójkątów
jest skierowana przeciwnie do swoich normalnych (log: `turned: N`).

## Szkielet `.bs` (SKEL v6, jawny)

```
"SKEL" u32 version (=6) u32 ctLods
LOD: string source, float maxDistance, u32 ctBones
  bone: string name, string parent (pusty = korzeń),
        float[12] absPlacement   (macierz 3×4 wierszami: [r00 r01 r02 tx | r10 … ty | r20 … tz])
        float[7]  relPlacement   (pozycja xyz + kwaternion w kolejności w, x, y, z — względem rodzica)
        float offsetLength, float boneLength
```

Skinning: `inverseBindMatrix = inverse(absPlacement)`, węzły glTF z `relPlacement`.
Kolejność kwaternionu (w, x, y, z) potwierdzona: obrót z `relPlacement` daje dokładnie `absPlacement`.

## Animacje `.ba` (ANIM v14, jawny)

```
"ANIM" u32 version (=14) u32 ctAnims
anim: string sourceFile, string name, float secondsPerFrame (1/30), u32 frames,
      float threshold, u32 compressed (w plikach 0), u32 customSpeed,
      u32 ctBoneEnvelopes × {
        string bone, float[12] defaultPos,
        u32 ctPos × { u16 frame, u16 pad, float3 position },   (względem rodzica)
        u32 ctRot × { u16 frame, u16 pad, float4 quat (w, x, y, z) },
        float offsetLength }
      u32 ctMorphEnvelopes × { string name, u32 n, float[n] }
```

Kości bez kluczy pozycji zostają w pozie z `.bs`. Animacje mają **ruch korzenia** (np. lis w ataku skacze
do przodu) — w walce trzeba to uwzględnić przy odstępie od celu.

## Opis modelu `.smc` (tekst)

```
OFFSET 0,0,0,180,0,0;          ← obrót 180° dla kamery SE; w IdleLC ignorujemy (modele patrzą w +Z)
NAME "Fox";
{ MESH TFNM "Data\monster\Animals\Fox.bm";
  TEXTURES { "d1_animal" TFNM "Data\monster\Animals\d1_animal.tex"; }
  SKELETON TFNM "…\Fox.bs";  ANIMSET TFNM "…\Fox.ba";  ANIMEFFECT TFNM "…\Fox.bae";
  ALLFRAMESBBOX …;  COLISION { … } }
```

Ścieżki w `.smc` bywają nieaktualne (np. rekwizyty mapy wskazują `Data\World\Guild\…`), więc
konwerter szuka pliku po samej nazwie, gdy pełna ścieżka nie istnieje. Wielkość liter w ścieżkach jest dowolna.

Postacie graczy składają się z części: `bd` (nogi), `bu` (tors), `ft` (stopy), `hn` (dłonie), `face`, `hair`
(u Healer i Mage także `bs` — dół szaty) plus broń i tarcza — wszystkie na jednym szkielecie klasy
(Knight: `ni.bs`, 115 kości, `ni.ba` 137 animacji). Ciało nowej postaci opisuje
`Data\Character\<klasa>\<ni|ti|hw|ma|ro|so>.smc` (części `*_000`).

Każdy przedmiot z bazy ma swój model: `t_item.a_file_smc` (np. `Data\Item\Shield\Knight\ni_bu_001.smc`).
Takie `.smc` ma same siatki (bez szkieletu), zważone na kości szkieletu klasy (nazwy kości się zgadzają) —
konwerter dokłada szkielet klasy z przedrostka nazwy pliku i zostawia tylko używane kości. Zbroja zastępuje
część ciała swojego slotu (zbroja `bu`, spodnie `bd` + ewentualnie `bs`, rękawice `hn`, buty `ft`, hełm
`hair`), broń i tarcza dochodzą jako nowe siatki (zważone na kość dłoni; `OFFSET` i siatki `_TAG_*` służą
do pokazania przedmiotu na ziemi / efektów). Hełmy poniżej 97 poz. wskazują pudełko z dropem
`Data\Item\Common\ITEM_treasure02.smc` — na postaci nic nie widać.

W starszej kopii Nemesis szyfrowanie całych plików wymuszało jednolite kolory tekstur,
zastępcze modele oraz alternatywne animacje. Partia `scripts/lc/batches/recovery-2015.json`
odzyskuje 258 teksturowanych modeli, 19 wcześniej zastąpionych modeli i 6 brakujących rękawic.
Manifest sprzętu zawiera teraz wszystkie 1158 źródłowych grup bez zastępczych modeli.
Kanoniczne animsety wskazane w SMC mają pierwszeństwo; starsze zamienniki są używane dopiero,
gdy kanonicznego pliku nie można odczytać. Ta sama zasada dotyczy Cursed Lich i Cursed Weaver.
Jednoteksturowa siatka może nadal użyć jedynej tekstury SMC przy różnicy nazwy klucza.

## Tekstura `.tex`

```
"TVER" u16 version (=4) u16 lcFlag     ← lcFlag=1: nagłówek TDAT zaszyfrowany (LC); 0: jawny SE
"TDAT" 6 × u32
   LC (zaszyfrowane, klucz 3e 3d 14 12 / krok 0x43): mexWidth, mexShift, mexHeight, fineMips, flags, frames
   SE (jawne):                                       flags, mexWidth, mexHeight, fineMips, mexShift, frames
   piksele: width = mexWidth >> mexShift, height = mexHeight >> mexShift
   flags & 1 = kanał alfa
"FRMS" surowe piksele mip 0: RGB (3 B) lub RGBA (4 B) × width × height × frames
"FRMC" u32 total, potem kolejne mipy: { u32 size, bloki DXT1 (8 B/4×4), DXT3 albo DXT5 (16 B/4×4) }
na końcu opcjonalnie "ANIM"/"ADAT" (animacja tekstury)
```

Nagłówki czytamy sekwencyjnie: ciąg `FRMC` wewnątrz pikseli `FRMS` nie jest nowym chunkem.
Wymiary pochodzą z TDAT, a rozmiary mipów muszą je potwierdzać; uszkodzone dane kończą się błędem.
Alfa wygładzona jest DXT3, chyba że flaga 32 wskazuje DXT5; alfa binarna lub brak alfy używa DXT1.
Wersja 3 ma dodatkowe pola mipów/rozmiaru ramki oraz piksele RGB5551 albo RGBA4444.
Czytnik sprawdza granice bufora i rozmiary przed alokacją. Tekstury proceduralne FXDT są odrzucane.
Konwerter eksportuje pierwszą klatkę i najwyższy mip, nie animuje tekstur.

Kanał alfa w teksturach postaci i potworów to zwykle maska połysku, nie przezroczystość — w glTF materiały
są OPAQUE i alfę pomijamy (tekstury → JPEG).

## Interfejs (`Data\Interface\*.tex`)

Atlasy w tym samym formacie `.tex`. Ikony przedmiotów: `ItemBtn{N}.tex`, siatka **32×32 px**;
przedmiot z bazy wskazuje ikonę przez `t_item.a_texture_id` (N), `a_texture_row`, `a_texture_col`.
Ikony umiejętności analogicznie: `SkillBtn{N}.tex` i `t_skill.a_client_icon_texid/row/col`.
Położenia HUD pochodzą z kodu klienta. Titles to akcja 49, ActionBtn0, wiersz 6 / kolumna 0.
Ramki nicku i tytułu są trzema fragmentami NamePopup, a paski ładowania używają UV z GameMP/Map.cpp,
nie szerokości narysowanego paska. `ui.mjs` kontroluje granice wszystkich wycinków; testy pilnują
sklejania fragmentów. Pełne źródło współrzędnych: [audyt zasobów](source-audit/assets.md).

## Umiejętności `Data\skills.lod` (jawny)

`scripts/lc/skill-anims.mjs` czyta cały układ według `Engine/Entities/Skill.cpp`: nagłówek
najwyższego indeksu, rekordy z dwoma zestawami broni, 141 bajtów na poziom, terminator -9999
i sumę CFileSecure. Plik 2015 zawiera 1787 rekordów (najwyższy indeks 1854), zgodnych do EOF.
Odczytywane są dokładne fazy ready/still/fire, nazwy efektów i metadane pocisków.
Nie stosujemy już wyszukiwania napisów ani zgadywania przesunięć 90/102 bajty.

75 mapowań klas ma wszystkie klipy w kanonicznych BA. Manifest zawiera 79 wpisów: zachowuje
też 4 wcześniejsze mapowania (10, 11, 23, 51), ponieważ ich rekordy w starszym kliencie są puste.
`ti_skill_10` nadal nie występuje — nie utożsamiamy go z innym `ti_skill10`; gra używa zamachu
zastępczego. `hw_s_skill_02`, `so_summon`, `so_stoneskin`, `so_vconverstion` odzyskano.
Drugi wariant broni jest odczytywany, ale wybór animacji w grze nadal używa pierwszego.
Odzyskanie animacji przywołania nie implementuje systemu przywołań.

Jawny `Effect.dat` z 2015 jest dostępny. Ustalono kontenery EFTB/EPGM/EEFM/EEGM/EFTE i odczytano
3413 grup z 11919 kluczami efektów. To jeszcze **nie jest pełny czytnik definicji ani renderer**.
Obecne `SkillEffects`, `TitleAura`, `UpgradeAura` nadal składają własne efekty z tekstur LC.
Nie opisujemy tego już jako braku archiwum lub szyfrowania; pozostała implementacja odczytu
poszczególnych typów i ich odtwarzania. Zob. [stan odzysku](source-audit/assets.md).

## Świat `.wld` (modele na mapie)

Plik świata Serious Engine: bryły (`BR3D`, sektory, wielokąty), encje, światła i modele rozstawione na mapie.
`scripts/lc/world.mjs` czyta tylko modele (ModelHolder3: drzewa, trawa, płoty, mury, domy):

- `ENs2`: u32 liczba encji, potem rekordy po 32 bajty: u32 id, u32 klasa, f32 x, y, z (metry mapy — te same co
  w terenie `.wtr`), f32 heading, pitch, banking (stopnie; obrót = Ry(heading) · Rx(pitch) · Rz(banking), jak
  `Euler(pitch, heading, banking, 'YXZ')` w three.js — sprawdzone na płotach, których końce się stykają).
- `ENT5`: stany encji w tej samej kolejności (u32 id na +4). Plik modelu to właściwość `08 01 f2 00` + u32 indeks
  w słowniku; instancja modelu: `MI03MISF` u32 0x18, u32 długość nazwy, nazwa, 4 bajty zer, 3 floaty skali
  (`stretch`).
- Ostatni `DICT` (u32 liczba + wpisy `DFNM`): klasy i ścieżki plików (`.smc`, `.ecl`…).

Juno (`StartZone\startzone.wld`): 8 246 modeli ze 128 plików `.smc`. Pomijane: niebo (`skybox`), znacznik
osi edytora. W Nemesis **zaszyfrowane są siatki trawy** (`grassani*`, `grass_0*`, `young_stgrass*`…) i kilku
drobiazgów (latarnia, wiadro, ławka) — tych nie ma. `scripts/lc/props.mjs` składa resztę w jeden
`public/maps/<mapa>/props.glb` (każdy model pod węzłem o swojej nazwie, bez szkieletu, tekstury 256 px WebP,
liście wycięte z kanału alfa) i `props.json` (`models`, `instances`: model, x, y, z, kąty, skala). Do gry trafiają
tylko modele do 125 m od miejsc walk i drogi między kolejnymi (reszta jest za mgłą); gra rysuje te do 120 m od
bohatera jako instancje (`src/scene/MapProps.tsx`), podnosi je razem z wyrównanym terenem miejsca walki
i pomija wysokie modele między kamerą a walką.

## Teren `.wtr` (`TRAR`)

`npm run convert-lc -- --client <klient> --only terrain` (`scripts/lc/terrain.mjs`, lista map `MAPS`
w `convert-lc.mjs`) zapisuje `public/maps/<mapa>/`: `terrain.json`, `heights.bin`, `layer-<n>.webp`,
`masks-<n>.webp`. Układ pliku (little endian):

- `TRAR` u32 1, `TRVR` u32 wersja (19/20), `TRGD`: u32 szerokość i wysokość siatki wysokości (np. 257 × 257
  = 256 komórek), u32 ×2 rozmiar mapy cieni, kilka u32, potem 7 floatów: współczynnik odległości, rozciągnięcie
  x / wysokość / z (np. 6 m na komórkę, 255/65535 m na jednostkę wysokości), rozmiar mapy w metrach (x, max
  wysokość, z).
- `TRHM`: wysokości u16, wiersz po wierszu wzdłuż osi z (indeks `j * szerokość + i`, x = i · 6 m).
- `TREM`: mapa krawędzi (komórki), `DFNM` + `TRSM`: mapy cieni pór dnia (`<mapa>_s0…s7.tex`), `TRTM`: mała mapa
  koloru (`<mapa>_t.tex`).
- Warstwy po kolei: `TRLT`, `DFNM` <tekstura warstwy>, `TRLV` u32, `TRLG` (148 bajtów; float nr 11 =
  rozciągnięcie: tekstura powtarza się co `rozciągnięcie × komórka` metrów), `TRLM` maska kwadratowa 256…2048
  bajtów na bok (255 = warstwa na wierzchu), po niej `DFNM` maski następnej warstwy (`<mapa>_a<n>.tex`, ta sama
  maska jako tekstura) albo koniec `TRDE`. Warstwa 0 to podłoże; każda następna kładzie się na poprzednie wg
  maski (`src/scene/LcTerrain.tsx` robi to w shaderze).
- **Pozycje spawnu** (`t_npc_regen`: `a_pos_x`, `a_pos_z`, `a_pos_h`) leżą wprost na terenie mapy: Dratan
  `Dratan.wtr` — wysokości zgadzają się co do 0,7 m (r = 1,000). Juno (strefa 0) **nie pasuje** do żadnego
  terenu klienta (`StartZone/startzone.wtr` i starszy `juno.wtr` mają ten sam kształt, korelacja ≈ 0), więc
  miejsca walk na Juno są dobrane przez konwerter (`pickArenas`: równy, suchy teren poza miastem, 14 m wolne
  od drzew i budynków z `.wld`, co najmniej 3 drzewa lub budynki przed kamerą w 18–80 m; pierwsze najbliżej
  miasta, każde następne najbliższe poprzedniemu) — **własne**.

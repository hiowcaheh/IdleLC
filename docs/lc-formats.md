# Formaty plików klienta LC (2015)

Klient LC jest zbudowany na **Serious Engine 1** (system modeli SKA). LC zmodyfikował część formatów
i zaszyfrował w nich liczby całkowite. Wszystko poniżej zostało ustalone na plikach z klienta 2015
i zweryfikowane: **76/76 siatek** czyta się co do bajta do końca pliku, **184/184 tekstur** dekoduje się
poprawnie, szkielety i animacje czytają się w całości. Konwerter: `npm run convert-lc` (`scripts/lc/`,
Node); prototyp w Pythonie w `tools/lc/` daje te same wyniki.

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
      xint ctTexCoords, xint ctColors, xint ctTextures, xint ctFloats
      string shader ("Shaders\Default.sha", "Shaders\NormalMap.sha", "Shaders\Color.sha", …)
      string[ctTextures] textures     (nazwy kluczy z .smc; dla NormalMap: [diffuse, normal])
      xint[ctTexCoords]   xint[ctColors] (RGBA)   float[ctFloats]   xint flags
  }
  ctWeightMaps × { string boneName, xint count, (u32 vertex, float weight)[count] }   (pary jawne)
  morph maps — w otrzymanych plikach zawsze 0, nieobsłużone
  u8[8 × ctVertices]  dane skinningu GPU: 4 indeksy do palety powierzchni + 4 wagi (0–255)
```

Do glTF bierzemy wagi z `weightMaps` (nazwa kości → wierzchołek, waga): top 4 wpływy na wierzchołek,
znormalizowane.

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

W kliencie Nemesis część plików jest zaszyfrowana w całości (bez nagłówka `TVER`, z datą 2025): tekstury
m.in. zestawów 60–109 poz., kilka siatek broni (`*_017`, `ni_shield_019`), atlasy interfejsu (także
`ItemBtn*.tex`) i animacje klas w wersji 254 (`ni.ba`, `ro.ba`, `so.ba` — zamiast nich `ni_ep1.ba`,
`ro_ep1.ba` i `so.ba` nieumarłego czarownika). Konwerter robi wtedy model sprzętu z prawdziwym kształtem
w jednolitym kolorze — średnim kolorze ikony przedmiotu z `public/icons/lc/items.webp` (tekstury `*_gold`
złote); 258 z 1146 modeli. Przedmiot z nieczytelną siatką (19) pokazuje najbliższy niższy model tego samego
rodzaju (`ni_sword_017` → `ni_sword_*`). Powierzchnia może nazywać teksturę inaczej niż `.smc`
(`ni_bu_017_1_gold` / `ni_bu_017_1`) — siatka z jedną teksturą bierze wtedy ją. Jawne kopie tekstur są
w kliencie 2015 (drugi `--client` po Nemesis je podmieni).

## Tekstura `.tex`

```
"TVER" u16 version (=4) u16 lcFlag     ← lcFlag=1: nagłówek TDAT zaszyfrowany (LC); 0: jawny SE
"TDAT" 6 × u32
   LC (zaszyfrowane, klucz 3e 3d 14 12 / krok 0x43): mexWidth, mexShift, mexHeight, fineMips, flags, frames
   SE (jawne):                                       flags, mexWidth, mexHeight, fineMips, mexShift, frames
   piksele: width = mexWidth >> mexShift, height = mexHeight >> mexShift
   flags & 1 = kanał alfa
"FRMS" surowe piksele mip 0: RGB (3 B) lub RGBA (4 B) × width × height × frames
"FRMC" u32 total, potem kolejne mipy: { u32 size, bloki DXT1 (8 B/4×4) lub DXT5 (16 B/4×4) }
na końcu opcjonalnie "ANIM"/"ADAT" (animacja tekstury)
```

Wymiary tekstury DXT bierzemy z TDAT. Sam łańcuch rozmiarów mipów nie odróżnia np. 256×128 od 128×256
(tak powstawały poszarpane tekstury niekwadratowe), więc służy tylko za zapas, gdy TDAT nie pasuje.

Kanał alfa w teksturach postaci i potworów to zwykle maska połysku, nie przezroczystość — w glTF materiały
są OPAQUE i alfę pomijamy (tekstury → JPEG).

## Interfejs (`Data\Interface\*.tex`)

Atlasy w tym samym formacie `.tex`. Ikony przedmiotów: `ItemBtn{N}.tex`, siatka **32×32 px**;
przedmiot z bazy wskazuje ikonę przez `t_item.a_texture_id` (N), `a_texture_row`, `a_texture_col`.
Ikony umiejętności analogicznie: `SkillBtn{N}.tex` i `t_skill.a_client_icon_texid/row/col`.
Położenia ramek i okien HUD w atlasach (`TopUI`, `NewCharacterInfo`, …) nie są zapisane w plikach —
klient ma je w kodzie, więc trzeba je wyciąć ręcznie.

## Umiejętności `Data\skills.lod` (jawny)

Tabela skilli klienta: rekord na umiejętność z nazwami klipów postaci (napisy z długością u32 na początku),
nazwami efektów i drugim zestawem dla drugiego rodzaju broni klasy (`*_a_*`, np. `ni_a_soul`). Układ rekordu
znamy tylko częściowo: **id skilla leży 102 bajty przed nazwą pierwszego klipu** (90 bajtów przy czarach
trójfazowych). Czary mają fazy `_1` (przygotowanie), `_2` (trzymanie), `_3` (wystrzał), np.
`hw_skill_02_1/2/3`; pozostałe skille — jeden klip. Nazwa klipu zaczyna się prefiksem klasy (`ti`, `ni`, `hw`,
`ma`, `ro`, `so`), więc parser (`scripts/lc/skill-anims.mjs`) bierze klip dla skilla tylko przy zgodnym
prefiksie. Wynik: `src/game/data/generated/lc-skill-anims.json` (66 skilli), a klipy dochodzą do modeli klas.
Brakujące w animsetach klienta Nemesis: `ti_skill_10`, `so_summon`, `so_stoneskin`, `so_vconverstion` —
te skille grają zwykły zamach.

Nazwy efektów z rekordu wskazują definicje w `Data\Effect\Effect.dat`, który w Nemesis jest
**zaszyfrowany** — dokładne efekty LC (cząsteczki, kolejność, kolory) są nieczytelne. Same tekstury efektów
(`Data\Effect\Texture`, `Data\Effect\Particle`, zwykłe `.tex`) są jawne: `npm run convert-lc -- --only fx`
zapisuje wybrane (`scripts/lc/fx.mjs`) do `public/fx/*.webp`, a gra składa z nich efekty według rodzaju
skilla (`src/scene/SkillEffects.tsx`).

## Świat `.wld` (jeszcze nie rozpracowany)

Plik świata Serious Engine: bryły (`BR3D`, sektory, wielokąty), encje, światła, modele rozstawione na mapie
(`MESH`, `MITS`, …). Teren mapy otwartej jest w osobnym pliku `.wtr` (`TRAR`) — w otrzymanej mapie
`ox_Event` (zamknięta sala quizu OX) jest pusty. Rekwizyty map (`Data\World\…\Ska\*.smc`) konwertują się
tak jak modele. Do sprawdzenia na mapie otwartej (np. strefa startowa).

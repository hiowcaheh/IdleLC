# Licencje assetów

Assety spoza LC trafiają do repozytorium tylko wtedy, gdy wolno je swobodnie rozpowszechniać
(preferowane CC0). Każdy nowy plik musi mieć wpis poniżej.

| Plik                                | Autor                                                                        | Źródło                                                                                                | Licencja | Zmiany                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| `public/models/RobotExpressive.glb` | Tomás Laulhé ([Quaternius](https://quaternius.com)), modyfikacje Don McCurdy | [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf/RobotExpressive) | CC0 1.0  | Optymalizacja gltf-transform (dedup, prune, resample, meshopt) |

## Zasoby pochodzące z LC (nie CC0)

Na decyzję właściciela (2026-10-29) w repo są też zasoby wygenerowane z klienta i bazy danych LC —
**nie są na wolnej licencji** i nie wolno ich traktować jak powyższych:

| Folder                     | Co zawiera                                       | Jak powstaje           |
| -------------------------- | ------------------------------------------------ | ---------------------- |
| `public/models/lc/`        | modele GLB postaci i potworów z klienta LC       | `npm run convert-lc`   |
| `public/icons/lc/`         | ikony przedmiotów z atlasów `ItemBtn*.tex`       | `npm run convert-lc`   |
| `src/game/data/generated/` | potwory, strefy, drop, przedmioty, exp z bazy LC | `npm run import-lc-db` |

Surowe pliki klienta i zrzut bazy nie są w repo.

Dungeons (2026-11-06): `public/dungeons/` zawiera sześć tekstur posadzek/ścian z
`Data/World/Dungeon1`, `Dungeon2`, `Dungeon3`, wyeksportowanych przez
`scripts/lc/dungeon-art.mjs`. `public/ui/lc/menu-dungeons.webp` to oryginalne Q
z TopUI (`UIRadar.cpp`, RADER_QUESTNPC). Grafiki wyboru `public/dungeons/*/loading.webp`
pochodzą z `Data/Interface/Loading/D_01.tex`, `D_02.tex`, `D_03.tex` (wycięcie 40,16,944,344).
Dwadzieścia nowych GLB w `public/models/lc/`
pochodzi z modeli potworów tego samego klienta 2015. Są objęte powyższą decyzją
właściciela dotyczącą konwersji zasobów LC, nie licencją CC0.

Czcionki (Cinzel, Alegreya Sans) ładowane z Google Fonts — licencja SIL Open Font License 1.1.

Dungeons superbuffy (2026-11-06): `page-left.webp` i `page-right.webp` to strzałki
z Quest.tex według questView.xml, UV 193,944,11,15 oraz 207,944,11,15. Katalog ikon
rozszerzono o oryginalne komórki przedmiotów 1416/2453/10953 oraz skilla 1075;
pochodzą z tych samych atlasów ItemBtn/SkillBtn klienta. Powyższa zgoda właściciela
obejmuje także te konwersje.

Skrzydła artefaktu (2026-11-06): `public/fx/artifact/angel_wing_03.glb` oraz
`angel_wing_03_b.glb` pochodzą z `Data/Effect/Ska/angelwing` tego samego klienta
2015, z oryginalnymi BM/BS/BA/TEX. `scripts/lc/artifact-effects.mjs` konwertuje je
i zapisuje definicje grupy Angel_wing03 z Effect.dat do `lc-artifact-effects.json`.
Powyższa decyzja właściciela obejmuje te zasoby LC; nie są CC0.

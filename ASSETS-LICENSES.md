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
| `src/game/data/generated/` | potwory, strefy, drop, przedmioty, exp z bazy LC | `npm run import-lc-db` |

Surowe pliki klienta i zrzut bazy nie są w repo.

Czcionki (Cinzel, Alegreya Sans) ładowane z Google Fonts — licencja SIL Open Font License 1.1.

# IdleLC — wytyczne projektu

## Cel projektu

Budujemy **IdleLC** — przeglądarkowe RPG typu IDLE / AFK z walką 3D, w klimacie klasycznego MMORPG z lat 2007–2010. Gracz tworzy postać, wybiera lokację i potwory, walczy aktywnie (auto-walka z animacjami 3D) albo wysyła postać na wyprawę AFK i wraca po expa i łupy. Gra ma działać na PC i telefonie, bez instalacji.

## Etap 1 (TERAZ): tylko frontend, bez backendu

- **Nie używamy teraz Supabase ani żadnego serwera.** Skupiamy się na frontendzie, scenie 3D, animacjach, UI i mechanice gry.
- Cała gra działa w przeglądarce, a stan gry zapisuje się lokalnie (`localStorage`).
- Hosting do testów: **GitHub Pages** — `https://hiowcaheh.github.io/IdleLC/`.
- Backend (Supabase) dodamy w etapie 2 — kod ma być od początku przygotowany tak, żeby dało się go podpiąć bez przepisywania gry (patrz „Warstwa danych”).

## Stack (nie zmieniaj bez pytania)

- **Frontend:** Vite + React + TypeScript
- **3D:** Three.js przez `@react-three/fiber` + `@react-three/drei`; modele w formacie **glTF/GLB** (kompresja meshopt lub Draco)
- **UI:** komponenty React + CSS (ciemny, „fantasy” styl, mobile-first)
- **Stan gry:** prosty store (Zustand) + zapis do `localStorage`
- **Testy:** Vitest dla logiki i formuł
- **Hosting:** GitHub Pages, deploy przez GitHub Actions przy każdym pushu na `main`
- `base: '/IdleLC/'` w `vite.config.ts`, routing przez `HashRouter` (GitHub Pages nie obsługuje SPA routingu)

## Warstwa danych (przygotowanie pod backend)

1. Cała logika gry (walka, exp, poziomy, łupy, AFK) w osobnym folderze `src/game/logic/` jako **czyste funkcje TypeScript** bez Reacta — łatwe do testowania i później do przeniesienia na serwer.
2. UI rozmawia z grą tylko przez interfejs `GameService` (np. `createCharacter`, `combatTick`, `startAfk`, `claimAfk`, `equipItem`, `upgradeItem`).
3. Teraz istnieje jedna implementacja: `LocalGameService` (liczy lokalnie, zapisuje do `localStorage`). W etapie 2 dodamy `SupabaseGameService` z tym samym interfejsem.
4. Zapis w `localStorage` z numerem wersji (`saveVersion`) i migracją starych zapisów, żeby aktualizacje nie kasowały postępu testerów. Przycisk „Reset zapisu” w ustawieniach.
5. **AFK lokalnie:** przy starcie wyprawy zapisz czas startu. Przy powrocie licz `min(teraz - start, 8h)`, symuluj walkę statystycznie (zabicia/h na podstawie statystyk postaci vs potwora) i wypłać nagrody. Ekran „Gdy cię nie było…” z podsumowaniem.
6. Tryb deweloperski (`?dev=1`): przyspieszenie czasu, dodanie expa/złota, podgląd animacji każdego modelu — do szybkiego testowania.

## Assety — WAŻNE

- Repo jest **publiczne** (wymagane przez darmowe GitHub Pages). Do repo trafiają tylko assety z darmową licencją (CC0), np. modele Quaternius lub Kenney, wpisane do `ASSETS-LICENSES.md`.
- **Nigdy nie commituj assetów z klientów innych gier ani innych plików bez wolnej licencji.** Folder `assets-src/` (pliki źródłowe właściciela) i `public/assets-local/` (ich skonwertowane wersje) są w `.gitignore` i służą tylko do lokalnych testów.
- `npm run convert-models` (gltf-transform; FBX/OBJ/DAE przez Blendera w trybie headless) konwertuje modele z `assets-src/` do zoptymalizowanych GLB.
- **Assety wymienne przez manifest:** każdy potwór/postać ma wpis w `src/game/assets/manifest.json`: `id`, ścieżka do modelu, skala, mapa nazw animacji (`idle`, `run`, `attack`, `hit`, `die`). Podmiana modelu = zmiana jednego wpisu, bez ruszania kodu gry.
- Assety spoza repo mogą być ładowane z konfigurowalnego `VITE_ASSET_BASE_URL`. Domyślnie gra działa na assetach CC0 z repo.
- Nie używaj nazwy „Last Chaos”, logotypów ani oryginalnych grafik w nazwie, UI ani materiałach promocyjnych. Nazwa gry: IdleLC.

## Dane gry (na razie pliki TS w repo)

Definicje w `src/game/data/` — w etapie 2 przeniesiemy je do bazy:

- `classes` (Tytan, Rycerz, Uzdrowiciel, Mag — statystyki bazowe i przyrost na poziom)
- `zones` (mapy/lokacje, wymagany poziom)
- `monsters` (lokacja, poziom, HP, atak, obrona, exp, złoto, model_id)
- `items` (typ, slot, statystyki, wymagany poziom, rzadkość)
- `lootTables` (potwór → przedmiot, szansa)

Formuły balansu w jednym module `src/game/logic/balance.ts`, opisane w `docs/balance.md`. Max poziom na start: 99.

## Kamienie milowe (po kolei, każdy kończy się działającym deployem na GitHub Pages)

- **M0 — Szkielet:** Vite+React+TS, ESLint/Prettier, Vitest, GitHub Actions → GitHub Pages, README.
- **M1 — Scena 3D:** jedna lokacja (teren, światło, mgła), postać gracza i potwór z CC0, auto-walka z animacjami (idle → bieg → atak → trafienie → śmierć → respawn), paski HP, wyskakujące liczby obrażeń. Płynnie na telefonie.
- **M2 — Postać:** ekran tworzenia postaci z wyborem klasy i podglądem modelu 3D, zapis lokalny.
- **M3 — Progres:** exp, poziomy, złoto, łupy z loot tables, HUD (pasek expa, poziom, złoto). Testy formuł.
- **M4 — AFK:** wyprawy do 8h, ekran podsumowania po powrocie.
- **M5 — Ekwipunek:** sloty, zakładanie przedmiotów, wpływ na statystyki i wygląd, ulepszanie +0…+15 z szansą niepowodzenia.
- **M6 — Świat:** kilka lokacji z wymaganym poziomem, mapa świata do wyboru.
- **Etap 2 (później, nie zaczynaj bez zgody):** Supabase — konta, zapis w chmurze, logika nagród po stronie serwera, ranking, targ.

## Sposób pracy

- Przed każdym kamieniem milowym pokaż krótki plan i poczekaj na akceptację.
- Małe, opisane commity. Po każdym kamieniu: lista zmian, link do wersji na GitHub Pages i co sprawdzić ręcznie.
- Jeśli coś jest niejasne (balans, wygląd, nazewnictwo) — zapytaj, nie zgaduj.
- Pisz po polsku w rozmowie; kod, nazwy zmiennych i komentarze po angielsku.

## Komendy

- `npm run dev` — serwer deweloperski (`http://localhost:5173/IdleLC/`)
- `npm run check` — lint + format + typecheck + testy (to samo co CI)
- `npm run build` — build produkcyjny do `dist/`
- `npm run convert-models` — konwersja modeli z `assets-src/`

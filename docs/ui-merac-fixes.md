# Loader, Merac i osiem zgłoszeń GUI

Data: 2026-11-04. Punkt wyjścia: `c744b39` na `main`.
Ta aktualizacja realizuje osiem nowych zgłoszeń właściciela. Nie oznacza
ukończenia pozostałych prac nad pełnym portem mechaniki i FX z audytu.
SaveVersion pozostaje **14**; zapis, balans, nagrody i blokady miast bez migracji.

## Zakres

1. **Merac:** mapa jest już w punkcie wyjścia tej aktualizacji. `lc-zone-7`
   wskazuje `public/maps/merac`, z oryginalnym terenem WTR, otoczeniem WLD,
   23 arenami, 38 modelami obiektów i 5667 instancjami. Jest w World map oraz
   Monster Book. Dostęp wymaga pokonania ostatniego potwora Dratan (`lc-452`).
   Nie dodajemy duplikatu strefy ani nie odblokowujemy jej wszystkim zapisom.
2. **Loader:** pojedyncza, ostra ilustracja ma `background-size: 100% 100%`.
   Wypełnia cały viewport, bez przycinania i skalowania animacją. Na telefonie
   zmienia proporcje, zgodnie z poleceniem wypełnienia ekranu całą grafiką.
   Usunięto rozmytą kopię oraz regułę `contain`. Zachowano dekodowanie obrazu,
   oczekiwanie na mapę/kamerę, pasek ładowania i nazwę krainy po wejściu.
3. **Nagrody Book:** próg zabójstw i kompaktowy Claim są nad przedmiotami.
   Ikona z ilością pozostaje nierozdzielną parą; kolejne przedmioty mogą zawijać
   się do następnego wiersza. Ilości nie konkurują z przyciskiem o wąską kolumnę.
   Zablokowany próg ma małą kłódkę z etykietą dostępności.
4. **EXP Character:** współdzieli wariant `Bar` i oryginalne zasoby
   `book-progress.webp` / `book-fill.webp` z paskiem Book. Procent jest na pasku,
   dokładna liczba EXP pod nim. Usunięto poprzednie nadpisania cienkiego paska.
5. **Skills:** oryginalna zielona ramka z atlasu `skill_new` wyświetla się tylko
   dla `learnState.canLearn`. Dotyczy aktywnych i okrągłych pasywnych ikon.
   Wymagania poziomu, SP, poprzednich umiejętności i blokad działają wspólnie
   z przyciskiem nauki. Maksymalnie rozwinięty skill nie ma poświaty.
6. **Pomoc o szybkościach:** przycisk po prawej stronie nagłówka otwiera osobny
   modal z `detail-window.webp` i nagłówkami `client-section.webp`. Wyjaśnia bieg,
   interwał ataku, przygotowanie skilla, zmianę cooldownu oraz koszt MP.
   Przykłady odpowiadają istniejącym funkcjom `applyStats`,
   `skillPreparationTime`, `skillCooldownTime` i `movementTime`, bez zmiany formuł.
   Wyjaśniono, że +80% cooldown bonus nie jest bezpośrednim skróceniem o 80%.
   Tab zostaje w górnym oknie, Escape zamyka pomoc i oddaje fokus przyciskowi.
7. **SP:** usunięto ikony z Character, podsumowania Skills i kosztu nauki skilla.
   Liczby i jednostka SP pozostają. Na ekranach do 360 px podsumowanie Skills
   ma dwa pełne wiersze, aby etykiety nie nachodziły na liczby. Oryginalny
   nieużywany plik zasobu zachowano.
8. **Teksty:** zastąpiono długie myślniki zwykłą interpunkcją w opisach,
   komunikatach, aria-label, title oraz opisie strony. Brak danych pokazuje
   `N/A`. Dane źródłowe nie zawierały tego znaku i nie wymagały modyfikacji.

## Sprawdzenia

- `npm run check`: lint, Prettier, TypeScript oraz **416/416 testów** w 47 plikach.
- `npm run build`: produkcyjny build z rzeczywistymi danymi LC.
- Kontrola AST plików TS/TSX: zero długich myślników w tekstach wykonywalnych UI.
- Chromium, produkcyjne dane LC: układ przy szerokościach **320, 390 i 1280 px**.
  Ilości wszystkich czterech nagród są widoczne, Claim ma ok. **52 × 30 px**,
  odbiór zmienia zapisany licznik odebranych progów z 0 na 1.
- Pasek EXP i Book mają identyczną ramkę, wypełnienie, wysokość **28 px**
  i formatowanie tekstu. W Character i Skills nie ma elementów ikony SP.
- Okno pomocy mieści tytuł przy 320 px, ma pięć sekcji oraz poprawny fokus,
  Tab, Escape i powrót do przycisku po zamknięciu.
- Nauka Shining Arrow z poziomu 1 do 5 usuwa zieloną ramkę. Ramka pasywnego
  skilla ma okrągły kształt. Brak SP, za niski poziom i brak wymaganego skilla
  blokują poświatę na niedostępnym poziomie. Nadal świecą bezpłatne poziomy,
  które można wyuczyć bez SP. Ikony są wycentrowane względem swoich ramek.
- Rzeczywiste kliknięcia World map: **Juno → Dratan → Merac → Egeha → Juno**.
  Loader ma pełne wymiary viewportu, `100% 100%` i brak transformacji/rozmycia,
  także w poziomie **844 × 390**. Osobno sprawdzono reduced motion przy 1280 px.
  Merac pobiera teren, wysokości, siedem warstw, dwie maski i komplet obiektów;
  Book pokazuje 23 potwory. Osobny zapis bez zwycięstwa nad Elite Sphinx Spear Man
  ma poprawnie zablokowany przycisk Merac.
- Zero błędów JS, konsoli, HTTP i nieudanych żądań w końcowych przebiegach.

[Skrót danych pomiarowych](ui-merac-validation.json). Publikacja przez istniejący
workflow GitHub Pages po pushu na `main`.

Test przeglądarkowy korzysta z lokalnego produkcyjnego buildu i przygotowanych
zapisów testowych, bez zmiany prywatnego postępu gracza. Chromium emuluje rozmiary
telefonu; nie jest to test na fizycznym iPhonie ani w Safari.

# Code review — lista zadań do wykonania

> Żywy dokument. Powstaje w pętli przeglądów (5 iteracji). Każda iteracja
> pogłębia analizę i dopisuje znaleziska. Pozycje **[ ]** = do zrobienia,
> **[x]** = naprawione. `P1` krytyczne / `P2` ważne / `P3` kosmetyka-higiena.
> Lokalizacje jako `plik:linia` (linie z chwili przeglądu — mogą się przesunąć).

## Postęp przeglądu (co już pokryto)

- [x] **Iteracja 1** — rdzeń: `soap.js`, `store.js`, `syncEngine.js`,
  `controller.js`, `git.js`, `log.js` + mostek Electron (`electron/main.js`,
  `preload.cjs`, `renderer/api.js`).
- [x] **Iteracja 2** — CLI: `App.jsx`, `commands.js`, `useController.js`,
  `window.js`, `index.jsx`, `bin/liquidflow.js`, komponenty Ink
  (`Picker`, `ConflictList`).
- [x] **Iteracja 3** — desktop renderer (`renderer/src/**`): `App.jsx`,
  `SyncView`, `ConflictsPanel`, `GitPanel`, `ShopForm`, `LogPanel`, `TopBar`,
  `main.jsx` + mostek zdarzeń.
- [x] **Iteracja 4** — i18n (parytet pl/en — skany czyste), `xml.js` (parser
  SOAP, edge-case'y), `translations.js`.
- [x] **Iteracja 5** — testy: inwentaryzacja (21 plików, 189 testów — wszystkie
  zielone), luki pokrycia względem znalezionych błędów, spójność z CLAUDE.md.

## Podsumowanie (przegląd ukończony — 5/5)

Łącznie **~20 pozycji**. Stan kodu: solidny rdzeń + CLI (189 testów zielonych),
najwięcej długu w desktopie (zgodnie z oczekiwaniem — był odłożony).

**Naprawić najpierw (P1, realne ryzyko działania):**
1. `git push` może wisieć w nieskończoność (brak `GIT_TERMINAL_PROMPT=0`/timeout).
2. Hot-reload pada na Linuksie z Node < 20 (rekurencyjny `fs.watch`).

**Następne (P2): desktop + dane.** Most `log:reset` do rendererza (mieszane logi,
duplikaty kluczy), brak loadera `progress`, boot bez `try/catch`, brak testów
desktopu; w rdzeniu: `_initialDownload` zapisuje meta dopiero na końcu,
`removeShop` osierocą dane, `logout` nie czyści haseł, `shell.openExternal` bez
walidacji, hardkody i18n `Auto-commit`/`Auto-push` (CLI + desktop).

**Reszta (P3):** higiena — szczegóły w sekcjach niżej.

---

## P1 — krytyczne (poprawność / zawieszenie)

- [x] **Polecenia git mogą zawiesić aplikację na stałe — brak timeoutu i
  `GIT_TERMINAL_PROMPT`.** Dodano `GIT_TERMINAL_PROMPT: '0'` + `GIT_ASKPASS`/
  `SSH_ASKPASS` puste do `GIT_ENV` w `git.js`; `run()` przyjmuje `timeout`
  (30 s domyślnie, 60 s dla `push`); timeout mapowany na czytelny komunikat.

- [x] **Hot-reload nie działa na Linuksie z Node < 20 (cicha awaria).**
  `engines.node` podniesiony do `>=20` w `package.json`. Catch `_startWatcher`
  podaje Node version w komunikacie błędu gdy `platform=linux && node<20`.

## P2 — ważne (robustność / dane / bezpieczeństwo)

- [x] **`_initialDownload` zapisuje `meta` dopiero na końcu — przerwanie psuje
  stan.** Zamieniono bulk `saveMeta` na `store.setMetaEntry` po każdym pliku
  — meta rośnie przyrostowo i przeżywa przerwanie.

- [x] **`removeShop` osierocą dane na dysku.** Dodano `store.deleteShopDir(shopName)`
  w `controller.removeShop` — kasuje `Shops/<Nazwa>/` po usunięciu z configu.

- [x] **`logout()` nie czyści odszyfrowanych haseł z pamięci.**
  `this.passwords.delete(this.state.currentShopId)` wywołane przed wyczyszczeniem
  sesji w `controller.logout()`.

- [x] **`shell.openExternal` na niewalidowanym URL-u.** `setWindowOpenHandler`
  i `sys.openExternal` przepuszczają tylko URL-e pasujące do `^https?:\/\/`.

- [ ] **Współdzielony klient SOAP używany poza kolejką sesji.**
  `controller.listTemplates` woła `client.liquidGet()` na tym samym kliencie co
  `SyncSession`. Niskie ryzyko, ale nieserializowane. → Serializować wywołania
  na poziomie klienta albo nie dzielić instancji. (odkładamy)

## P3 — higiena / drobne

- [ ] **`signInShop` na sztywno `'webmaster'`.** Comarch zawsze wymaga tego loginu
  — zostawione z komentarzem w kodzie. (świadome)

- [ ] **Szyfrowanie haseł bez uwierzytelnienia (AES-256-CBC, bez MAC).**
  Model zagrożeń: „przypadkowy odczyt pliku" — zakres ochrony OK dla use-case.
  (świadome, do udokumentowania gdy priorytet wzrośnie)

- [x] **Efekt uboczny przy imporcie `store.js`.** `ensureDir(APP_DIR)`/
  `ensureDir(SHOPS_DIR)` przeniesione do leniwego `ensureAppDirs()` wywoływanego
  przez `loadConfig`/`saveConfig`/`getKey`.

- [x] **Walidacja pliku tekstowego przepuszcza VT/FF.** Komentarz poprawiony —
  dokładnie opisuje bajty 0–8 (odrzucane) vs 9–13 (przepuszczane) i zaznacza,
  że kontrakt Comarch nie zabrania VT/FF.

- [x] **`start()` traktuje katalog z samymi dot-plikami jako pusty.**
  Warunek `fresh` rozszerzony: katalog z samym `.git` (git.isRepo) NIE jest
  już traktowany jako pusty → pobieranie nie nadpisze zainicjowanego repo.

- [x] **Desktop: brak UI loadera dla zdarzenia `progress`.** Stan `progress`
  dodany do kontekstu App; `onEvent` obsługuje `progress` i czyści go przy
  `state` bez aktywnego szablonu. (Wizualny komponent postępu — do zrobienia.)

---

## CLI (iteracja 2)

### P2
- [x] **Hardkodowane etykiety `Auto-commit` / `Auto-push` (łamie twardą zasadę
  i18n).** Dodano klucze `AutoCommit`/`AutoPush` do `translations.js`; użyte w
  `commands.js` (menu `/git`) i `GitPanel.jsx` (desktop).

### P3
- [ ] **Optymistyczny stan przełącznika w `Picker` rozjeżdża się z prawdą przy
  błędzie.** `Picker.jsx` trzyma lokalny `toggles[i]` bez rekoncyliacji z
  emitowanym zdarzeniem `git`. Niskie znaczenie — zostawione.
- [ ] **Otwarte nakładki trzymają migawkę danych.** `ConflictList`/`ConnectList`
  nie odświeżają się przy zmianie `mismatches`/`shops` w tle. Świadome
  uproszczenie — odświeżenie następuje przy wejściu/akcji.
- [x] **`SIGTERM`/`SIGHUP` kończą proces bez `ctrl.dispose()`.** Referencja do
  `unmount` Inka przypisywana po `render()`; handlery sygnałów wywołują ją przed
  `process.exit(0)` → React cleanup (→ `ctrl.dispose()`) działa.
- [ ] **Gołe `/` + Enter uruchamia pierwszą komendę z listy.** Niskie znaczenie
  — zostawione.

## Desktop renderer (iteracja 3)

### P2
- [x] **`log:reset` nie dociera do renderera.** `log:reset` dodany do listy
  zdarzeń w `electron/main.js`; `onEvent` w `App.jsx` obsługuje go pełną
  podmianą `setLog` (reverse + slice(500)).
- [x] **Zdarzenie `progress` ignorowane.** Stan `progress` dodany do App;
  `onEvent` obsługuje `progress` i czyści go na `state` bez szablonu.
- [x] **Boot bez obsługi błędu — biały ekran przy błędzie backendu.**
  Asynchroniczne IIFE w `useEffect` owinięte w `try/catch` z `toast.error` i
  `navigate('welcome')`.

### P3
- [x] **`ConflictsPanel` używa indeksu tablicy jako klucza.** Klucz zmieniony
  na `${m.File.Mode}/${m.File.Name}`.
- [ ] **Brak React error-boundary w rendererze.** `main.jsx` montuje `App` bez
  granicy błędów. → Do zrobienia (Faza 3).
- [x] **`ShopForm` `maxLength={20}` na nazwie sklepu.** Usunięty arbitralny
  limit — walidacja to tylko `^[A-Za-z0-9]+$` (spójna z CLI/rdzeniem).

## i18n + parser XML (iteracja 4)

### Parytet i18n — czysty ✅
- [x] **Hardkodowane etykiety `Auto-commit`/`Auto-push`.** Naprawione (patrz CLI P2).

### `xml.js` — P3
- [x] **Mylący komentarz: „CDATA -> text".** Poprawiony — jasno mówi, że CDATA
  nie jest obsługiwane i nie ruszane przez preprocessing.
- [x] **Atrybuty tylko w cudzysłowie podwójnym.** Dodany komentarz opisujący
  ograniczenie (apostrofy nie obsługiwane; kontrakt ASMX zawsze używa `"`).
- [ ] **Węzły tekstowe złożone z samych białych znaków są pomijane.**
  Świadome — przy obecnym kontrakcie base64 bez znaczenia. (zostawione)

## Testy (iteracja 5)

Stan: `npm test` → **189/189 zielone**, 21 plików (core + CLI).

### P2
- [ ] **Desktop nie ma ŻADNYCH testów.** Największa luka pokrycia — `Faza 3`
  wg CLAUDE.md. `@testing-library/react`+jsdom z atrapą `window.api` + e2e
  Playwright. (do zrobienia)

### P3
- [ ] **`git push` przetestowany tylko po happy-path.** Brak testu
  timeout/zawieszenia (naprawiony P1). Do rozważenia przy osobnym PR testów.
- [ ] **Brak testu przerwanego `_initialDownload`.** Scenariusz „pliki zapisane,
  meta nie" (naprawiony P2). Do rozważenia przy osobnym PR testów.
- [ ] **e2e poza `npm test`** (świadomie). Pamiętać przy zmianach boot/alt-screen.

## Uwagi pozytywne (żeby nie psuć przy refaktorze)
- `npm test` w pełni zielone (189 testów) — solidna siatka regresji dla core+CLI.
- Parser `xml.js` jest odporny na XXE / „billion laughs": nie parsuje `DOCTYPE`
  ani definicji encji zewnętrznych — bezpieczny dla odpowiedzi z sieci w Electronie.
- i18n trzyma 100% parytet pl/en (zweryfikowane skanami).

- Kolejka `_queue` + zatrzymywanie watchera na czas komend (`syncEngine.js:320`)
  skutecznie eliminuje pętlę zwrotną zapis→watcher.
- Mostek IPC jest wąski i bez `nodeIntegration`, z `contextIsolation` i CSP w
  produkcji (`electron/main.js:47,134`) — dobra higiena Electrona.
- Strukturalne logi i18n (deskryptory `tmsg`) + trwała historia per-szablon są
  spójnie poprowadzone przez `log.js`/`store.js`/`controller.js`.

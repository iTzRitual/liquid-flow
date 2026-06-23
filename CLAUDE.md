# CLAUDE.md

Wskazówki dla przyszłych sesji pracujących nad tym repozytorium.

## Czym jest projekt

**Liquid Flow** — narzędzie do synchronizacji i hot‑reloadu szablonów Liquid w
sklepach **Comarch e‑Sklep**. Edytujesz pliki lokalnie, a zmiany lecą od razu na
serwer sklepu (SOAP). Dwie warstwy prezentacji nad wspólnym rdzeniem:

- **Desktop** (Electron) — `apps/desktop`, GUI React, ikona w tray, build do
  .dmg/.exe/.AppImage.
- **CLI** (`liquidflow`) — `apps/cli`, interaktywny TUI w Ink (React w terminalu).

> Branding: zawsze **Liquid Flow** / `liquidflow`. Nie wprowadzać odniesień do
> oryginalnego narzędzia ani słów „kopia/przeróbka/reverse engineering". Logo to
> placeholdery (kwadrat dla desktopu, ASCII‑gradient dla CLI).

## Architektura (monorepo, npm workspaces)

```
packages/core/   @liquidflow/core — cała logika, niezależna od UI
  src/
    controller.js  orkiestracja stanu; EventEmitter (zdarzenia poniżej)
    soap.js        klient SOAP iSklep24Service.asmx (+ cookie sesji)
    syncEngine.js  watcher plików, hot-reload, wykrywanie konfliktów, postęp
    store.js       konfiguracja, metadane, ścieżki, szyfrowanie haseł
    git.js         wersjonowanie/backup (opakowanie poleceń `git`)
    log.js         bufor logu (EventEmitter 'entry'); kolory hex
    translations.js  pl/en (UI), xml.js (parser SOAP)
  index.js         publiczny barrel export
apps/desktop/    @liquidflow/desktop — electron/ (main.js, preload.cjs) + renderer/ (Vite+Tailwind+shadcn)
apps/cli/        @liquidflow/cli — bin/liquidflow.js + src/ (Ink)
```

**Wzorzec kluczowy:** `core` nie importuje Electrona ani Ink/React. `Controller`
trzyma cały stan i emituje zdarzenia, a obie apki to „skóry" subskrybujące te
zdarzenia:

- `log` — nowy wpis logu `{ Id, TS, Text, Color }`
- `mismatches` — lista konfliktów
- `state` — `{ currentShop, currentTemplate, language, insecureTLS }`
- `git` — status repo (gitStatus)
- `progress` — etapy startu synchronizacji (`download`/`check`/`ready`)

Desktop mostkuje to przez IPC (`electron/preload.cjs` → `window.api`,
`electron/main.js` → handlery). CLI subskrybuje bezpośrednio w
`apps/cli/src/useController.js`.

## Protokół (NIE zmieniać)

SOAP Comarch e‑Sklep jest kontraktem API sklepu — stałe są wymagane do działania:
namespace `http://www.icomarch24.pl/iSklep24`, endpoint `iSklep24Service.asmx`,
`SOAPAction`, kolejność pól, klasa `ISklep24Client`. Limity: nazwa ≤ 64 znaki,
plik ≤ 519168 B, walidacja plików tekstowych.

## Struktura danych i tryby szablonu

Katalog danych (nadpisywany przez `LIQUID_FLOW_HOME`, w Electronie = userData):
- macOS `~/Library/Application Support/LiquidFlow/`, Win `%APPDATA%\LiquidFlow\`,
  Linux `~/.config/liquid-flow/`.
- Układ: `Shops/<Nazwa>/files/<TemplateId>/<Mode>/<ścieżka>` + `meta/<id>.json`
  (znaczniki czasu do porównań) + `config.json`.

**Tryby (`Mode`)**: podfoldery `0` i `2` to **realne zestawy plików szablonu na
serwerze** (oba pobierane, oba obserwowane, oba synchronizowane). To NIE są
lokalne mirrory — porównanie lokalne↔zdalne trzyma się w `meta/`, nie w folderze.
Pracuje się głównie w `0`.

**Git**: repo żyje w folderze roboczym `files/<id>/0` (a nie na poziomie
szablonu). Wszystkie ścieżki z kropką (`.git`, `.DS_Store`) są pomijane przez
synchronizację (`store.parseLocalPath` zwraca `null`), więc wnętrze `.git` nie
trafia do e‑Sklep. Historia współdzielona przez zdalne repo (GitHub), nie przez
Comarch. `git push` ≠ wysyłka do sklepu (ta jest automatyczna przez watcher).

## CLI — szczegóły (apps/cli)

- **Uruchamianie bez kroku budowania**: `bin/liquidflow.js` rejestruje `tsx`
  (`register()`), potem dynamicznie importuje `src/index.jsx`. JSX działa wprost.
- **JSX**: w plikach JSX dodawany jest `import React` (tryb klasyczny — niezależny
  od konfiguracji tsx; `tsconfig.json` ma `react-jsx`, ale nie polegać na nim).
- **Alternatywny bufor ekranu**: `index.jsx` wchodzi w alt‑screen (`\x1b[?1049h`)
  i wychodzi przy zakończeniu — brak zaśmiecania scrollbacku terminala.
- **Model trybów w `App.jsx`** (`mode.type`): `input` (prompt + paleta), `picker`
  (lista wyboru), `form` (sekwencyjny formularz), `loading` (spinner na czas
  pobierania). Helpery w `ctx`: `openPicker`, `openForm`, `withLoading`,
  `skipToInput`, `safe`.
- **Komponenty**: `Banner` (ASCII + gradient tęczowy per znak), `StatusBar`
  (nagłówek; `~` gdy niepołączony; Sklep/Szablon/Git tylko gdy istnieją;
  konflikty osobno — czerwone, do prawej), `LogPane` (obcina linie
  `wrap="truncate-end"`), `Divider` (znak `─`, kolor `#82bbff`), `Picker`
  (pozycje akcji + pozycje `kind:'toggle'` przełączane `←/→`), `Form` (pola
  tekstowe i `type:'choice'` Tak/Nie strzałkami), `ProgressView`+`Spinner`
  (loader pobierania/sprawdzania), `CommandPalette`.
- **Anty‑przepełnienie (ważne!)**: Ink renderuje inline — jeśli ramka przekroczy
  wysokość okna, dokleja kopię („rozdwojenie"). Dlatego: (1) długie linie są
  obcinane, (2) listy są „okienkowane” przez `window.js` (`windowList`) z
  wysokością liczoną z `termRows` i wskaźnikami `↑/↓ więcej`, (3) log chowa się
  gdy otwarta paleta, (4) input zawsze na dole. Przy zmianach layoutu pilnować,
  by suma wysokości ≤ `termRows`.
- **Slash‑komendy** (`commands.js`, `buildCommands(ctx)`): `/connect /login
  /shops /templates /files /download-all /upload-all /refresh /git /open /lang
  /logout /remove /clear /exit(quit)`. Wpisanie `/` filtruje paletę; lista
  startowa „Połącz ze sklepem" otwiera się automatycznie gdy niepołączony, a `/`
  ją przeskakuje.

## Konwencje kodu

- **ESM** wszędzie (`"type":"module"`), Node 18+.
- **Język**: komentarze i UI po polsku; tłumaczenia w `translations.js` (pl/en),
  ale uwaga — logi w `controller.js`/`commands.js` są na razie hardkodowane po
  polsku (pełne i18n logów to dług techniczny do ewentualnego domknięcia).
- **Styl**: dopasuj się do otaczającego kodu; zwięzłe funkcje; bez nadmiarowych
  zależności (np. spinner/okno napisane ręcznie, nie z paczek).
- **Commity**: Conventional Commits po angielsku (`feat(cli): …`, `fix(git): …`,
  `style(cli): …`). **Bez** stopki „Co-Authored-By". **Workflow**: po każdym
  prompcie/zadaniu — commit + `git push origin main`. Wiadomość: typ zmian
  (feat/fix/style/etc.) + krótkie streszczenie (jedna linia, co się zmieniło).
  Pracujemy bezpośrednio na `main`. Remote:
  `git@github.com:iTzRitual/comarch-liquid-sync-2026.git`.
- **Weryfikacja CLI**: render testuje się pod pseudo‑terminalem, np.
  `script -q /dev/null node apps/cli/bin/liquidflow.js` (kolory: `FORCE_COLOR=3`).
  Błąd „Raw mode is not supported" pojawia się tylko bez TTY (np. `node -e`/potok)
  i nie oznacza buga.

## Uruchamianie / build

```bash
npm install                # wszystkie workspaces (raz)
npm run dev                # desktop (Vite + Electron, hot-reload)
npm run build:mac|win|linux  # paczki desktop -> apps/desktop/release/
npm run cli                # CLI z repo (albo: npm link --workspace @liquidflow/cli && liquidflow)
```

## Aktualny stan prac

Zrealizowane: monorepo + rdzeń, przeniesienie desktopu, pełny rebranding na
Liquid Flow, kompletny interaktywny CLI (Ink) z paletą komend, pickerami i
formularzami. Doszlifowane: zapisywanie hasła z auto‑loginem (`signInSaved`),
rozłączanie (`logout`), płaskie menu `/git` z inline togglami i wykrywaniem repo,
czytelna sekwencja startu synchronizacji z loaderem ASCII, ekran ładowania listy
szablonów, alt‑screen, okienkowanie list, repo git w trybie `0`.

Znane/otwarte tematy: pełne i18n logów (część PL na sztywno); ewentualne
ulepszenia czytelności logów (ikony poziomów `✓/ℹ/✗`, „Pobrano/Wysłano" zamiast
etykiet przycisków, krótszy identyfikator pliku); brak `git clone/pull` z remote
(współpracownik nie zaciągnie historii przez aplikację); desktop dostaje zdarzenie
`progress`, ale nie ma jeszcze UI loadera startu. Migracja: stare repo git z
poziomu szablonu nie jest automatycznie przenoszone do `0`.

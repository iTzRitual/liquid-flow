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
- **Komponenty**: `Header` (nagłówek = 2 kolumny: logo i informacje; logo ma
  `flexShrink=0`, kolumna informacji `flexGrow=1` + `justifyContent="space-between"`
  — status u góry, wskaźnik konfliktów do prawej i przyklejony do dołu/Dividera),
  `Banner` (ASCII + gradient tęczowy per znak, 17×6), `StatusBar` (`~` gdy
  niepołączony; Sklep/Szablon/Git tylko gdy istnieją; każdy wiersz to jeden
  `<Text wrap="truncate-end">`, więc przy wąskim oknie przycina się jako całość
  zamiast łamać etykiety/dokładać puste linie), `LogPane` (wpisy ZAWIJAJĄ się
  `wrap="wrap"`, by długie linie były czytelne w całości; liczy realną wysokość
  każdego wpisu po zawinięciu tą samą `wrap-ansi`+hard co Ink i dobiera od
  najnowszego tyle, ile mieści się w budżecie `rows`; `height`+`overflow:hidden`
  jako bezpiecznik), `Divider` (znak `─`, kolor `#82bbff`), `Picker`
  (pozycje akcji + pozycje `kind:'toggle'` przełączane `←/→`), `Form` (pola
  tekstowe i `type:'choice'` Tak/Nie strzałkami), `ProgressView`+`Spinner`
  (loader pobierania/sprawdzania), `CommandPalette`. Layout nagłówka testuje się
  na różnych szerokościach: `node apps/cli/test/header-widths.mjs`.
- **Layout nagłówka (`Header.jsx`) — NIE psuć!** Świadomy układ **2‑kolumnowy**;
  historycznie był wielokrotnie psuty, więc reguły są twarde:
  ```
  ┌ marginTop=1 ──────────────────────────────────────────────┐
  │  LOGO            INFORMACJE (jedna kolumna, flexGrow=1)     │
  │  (Banner)        Liquid Flow CLI 0.9      ← status u góry   │
  │  flexShrink=0    Sklep:   ● …  (truncate-end)               │
  │  17×6            Szablon: …                                 │
  │                  Git:     …                                 │
  │                              ⚠ Konflikty: N (/conflicts) ◄──┤ do prawej, dół
  └────────────────────────────────────────────── Divider ─────┘
  ```
  Niezmienniki:
  1. **Dwie kolumny, nie trzy.** Logo + kolumna informacji. Konflikty to
     **wiersz wewnątrz** kolumny informacji (osobny od wierszy statusu), a NIE
     trzecia kolumna — inaczej kradną szerokość „Sklep/Szablon".
  2. **Logo `flexShrink={0}`** — nigdy się nie kurczy ani nie zawija (zawinięcie
     ASCII‑artu = „rozpad logo").
  3. **Kolumna informacji `flexGrow={1}` + `flexDirection="column"` +
     `justifyContent="space-between"`** — status lgnie do góry, konflikty do dołu.
  4. **Konflikty**: `<Box justifyContent="flex-end">` (do prawej) z
     `<Text wrap="truncate-end">`, renderowane tylko gdy `mismatches.length>0`.
     Przyklejone do Dividera, **nie dokładają wiersza** (wysokość headera =
     wysokość logo). Brak `marginBottom` na headerze.
  5. **Każdy wiersz `StatusBar` = jeden `<Text wrap="truncate-end">`** (etykieta i
     wartość jako zagnieżdżone `<Text>`). Inaczej przy wąskim oknie łamią się
     etykiety i pojawiają puste linie. Jedyny element, który ustępuje szerokości,
     to kolumna informacji (URL się przycina) — logo i wskaźnik nigdy.
  6. **Bardzo wąskie okno (`cols < HEADER_STACK_COLS`, próg w `Header.jsx`)**:
     układ przełącza się z 2 kolumn na 2 wiersze (logo na górze, informacje na
     pełną szerokość pod spodem). `App.jsx` przekazuje `cols={termCols}` i dla
     stackowanego nagłówka zwiększa stałą `HEADER` (jest wyższy).
  7. Po zmianach: `node apps/cli/test/header-widths.mjs` (sprawdza 30–120 kol.,
     w tym przełączenie kolumny↔wiersze).
- **Resize / spacery (100% szerokości)**: Ink przy resize tylko przelicza Yogę na
  istniejącym drzewie — **nie wywołuje ponownie komponentów** i nie czyści ekranu,
  więc statyczne stringi (np. `'─'.repeat(cols)` w `Divider`) zostają w starym
  rozmiarze i terminal je zawija. Dlatego `App.jsx` w handlerze `resize`: (1) pisze
  `\x1b[2J\x1b[3J\x1b[H` (pełne czyszczenie — bez zawiniętych resztek), (2)
  aktualizuje `termRows` **i** `termCols`, co wymusza pełny re-render. Dzięki temu
  dividery/spacery zawsze mają 100% bieżącej szerokości, a Header przelicza układ.
- **Anty‑przepełnienie (ważne!)**: Ink renderuje inline — jeśli ramka przekroczy
  wysokość okna, dokleja kopię („rozdwojenie"). Dlatego: (1) `LogPane` zawija
  wpisy, ale liczy ich realną wysokość i pokazuje tylko tyle, ile mieści się w
  budżecie wierszy (inne komponenty obcinają długie linie `truncate-end`),
  (2) listy są „okienkowane” przez `window.js` (`windowList`) z
  wysokością liczoną z `termRows` i wskaźnikami `↑/↓ więcej`, (3) log chowa się
  gdy otwarta paleta, (4) input zawsze na dole. Przy zmianach layoutu pilnować,
  by suma wysokości ≤ `termRows`.
- **Slash‑komendy** (`commands.js`, `buildCommands(ctx)`): `/connect /login
  /shops /templates /conflicts /git /open /lang /logout /remove /clear
  /exit(quit)`. Wpisanie `/` filtruje paletę; lista startowa „Połącz ze sklepem"
  otwiera się automatycznie gdy niepołączony, a `/` ją przeskakuje. Operacje
  seryjne (pobierz/wyślij wszystkie) nie są osobnymi komendami — żyją na końcu
  ekranu `/conflicts` jako pozycje z potwierdzeniem (sens mają tylko przy
  konfliktach). Ekran `/conflicts` pokazuje przy każdym pliku, która strona jest
  nowsza, a w widoku akcji trzy znaczniki czasu (📄 plik / 💾 lokalny / ☁️
  zdalny). Wskaźnik konfliktów siedzi w nagłówku (obok logo, nie spycha układu)
  i kieruje do `/conflicts`. Nie ma `/refresh` — `SyncSession` przelicza
  konflikty cyklicznie w tle (`POLL_MS`), wyłapując zmiany po stronie sklepu.

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

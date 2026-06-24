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
    log.js         bufor logu z kanałami/scope (EventEmitter 'entry'+'reset'); kolory hex
    translations.js  pl/en (UI), xml.js (parser SOAP)
  index.js         publiczny barrel export
apps/desktop/    @liquidflow/desktop — electron/ (main.js, preload.cjs) + renderer/ (Vite+Tailwind+shadcn)
apps/cli/        @liquidflow/cli — bin/liquidflow.js + src/ (Ink)
```

**Wzorzec kluczowy:** `core` nie importuje Electrona ani Ink/React. `Controller`
trzyma cały stan i emituje zdarzenia, a obie apki to „skóry" subskrybujące te
zdarzenia:

- `log` — nowy wpis logu `{ Id, TS, Text, Color, kind?, historic? }`
- `log:reset` — pełna podmiana bufora po przełączeniu kanału logu (poniżej)
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

## Logi — kanały (scope) i trwała historia per‑szablon

`log.js` nie jest już jednym globalnym buforem — trzyma **kanały** i ma jeden
**aktywny** naraz (bo aktywna jest tylko jedna sesja synchronizacji). Producenci
nadal wołają `logInfo/logOk/logErr` bez wiedzy o kanale; wpis trafia do bieżącego.
`Controller` przełącza kanał (`logbuf.setActiveChannel(key, opts)`) w punktach
życia:
- `app` — przed połączeniem (efemeryczny),
- `shop:<id>` — połączony sklep, brak szablonu (efemeryczny),
- `tpl:<shopId>:<tplId>` — aktywny szablon (**trwały**: `opts.persist` dopisuje
  każdy live‑wpis do pliku, `opts.history` wczytuje poprzednie wpisy).

Przełączenie kanału emituje `'reset'` (Controller → `'log:reset'`) z pełnym
buforem — UI podmienia cały log (CLI: `useController` ustawia `log` i bumpuje
`logVersion`, a `App.jsx` zjeżdża scrollem na dół). Każdy kanał ma własną
sekwencję `Id`.

**Trwała historia per‑szablon**: `store.appendLogEntry` / `store.readLogTail`
(plik `Shops/<Nazwa>/logs/<tplId>.jsonl`, JSON‑per‑linia, przycinany do 1000
linii). Plik żyje **poza** `files/<id>/`, więc nie trafia do synchronizacji ani
do repo git szablonu. Przy starcie sesji (`_startSession`) Controller: wczytuje
ogon historii (wpisy dostają `historic:true` → wyszarzone w `LogPane`), dokłada
`logbuf.separator('Nowa sesja • …')` (`kind:'separator'`, renderowany jako linia
działowa „── … ─────"), dopiero potem płynie nowa sesja. `buildVlines` obsługuje
oba pola: separator (kolor `#82bbff`, pełna szerokość) i `historic` (`dimColor`).

## CLI — szczegóły (apps/cli)

- **Uruchamianie bez kroku budowania**: `bin/liquidflow.js` rejestruje `tsx`
  (`register()`), potem dynamicznie importuje `src/index.jsx`. JSX działa wprost.
- **JSX**: w plikach JSX dodawany jest `import React` (tryb klasyczny — niezależny
  od konfiguracji tsx; `tsconfig.json` ma `react-jsx`, ale nie polegać na nim).
- **Alternatywny bufor ekranu + scroll**: `index.jsx` wchodzi w alt‑screen
  (`\x1b[?1049h`) i wychodzi przy zakończeniu — brak zaśmiecania scrollbacku
  terminala. Dodatkowo „alternate scroll mode" (`\x1b[?1007h`): kółko myszy w
  alt‑screenie wysyła strzałki ↑/↓ do aplikacji (zamiast przewijać terminal),
  więc scroll przewija log na ekranie głównym. W trybie `input` (paleta zamknięta)
  `App.jsx` obsługuje `↑/↓`/`PgUp`/`PgDn` jako przewijanie `LogPane` (`logScroll`),
  a `setLogScroll(0)` po komendzie wraca na dół. Sekwencje włącza/wyłącza się
  parami przy starcie/zakończeniu.
- **Ctrl+C jest celowo ignorowany** (żeby przypadkowe naciśnięcie nie ubiło
  sesji synchronizacji): `render(<App/>, { exitOnCtrlC: false })` + no‑op
  `process.on('SIGINT', …)` w `index.jsx` (zabezpieczenie na brak trybu raw, np.
  pipe). Wyjście **tylko** przez komendę `/exit` (woła `exit()` z Ink → czyste
  odmontowanie + `leaveAlt`) albo zamknięcie terminala. Podpowiedź w polu input
  mówi „/exit wyjście".
- **Model trybów w `App.jsx`** (`mode.type`): `input` (prompt + paleta), `picker`
  (lista wyboru), `form` (sekwencyjny formularz), `loading` (spinner na czas
  pobierania). Helpery w `ctx`: `openPicker`, `openForm`, `withLoading`,
  `skipToInput`, `safe`, oraz `logWrap`/`setLogWrap` (tryb zawijania logów dla
  komendy `/wrap`).
- **Komponenty**: `Header` (nagłówek = 2 kolumny: logo i informacje; logo ma
  `flexShrink=0`, kolumna informacji `flexGrow=1` + `justifyContent="space-between"`
  — status u góry, wskaźnik konfliktów do prawej i przyklejony do dołu/Dividera),
  `Banner` (ASCII + gradient tęczowy per znak, 17×6), `StatusBar` (`~` gdy
  niepołączony; Sklep/Szablon/Git tylko gdy istnieją; każdy wiersz to jeden
  `<Text wrap="truncate-end">`, więc przy wąskim oknie przycina się jako całość
  zamiast łamać etykiety/dokładać puste linie), `LogPane` (log ekranu głównego —
  PRZEWIJANY i z trybem zawijania. `buildVlines(log, wrap, cols)` spłaszcza wpisy
  do „wizualnych wierszy": `wrap=false` → 1 wpis/wiersz `truncate-end`,
  `wrap=true` (`/wrap`) → długie wpisy zawijane przez `wrap-ansi`+hard. Render
  okienkuje vlines wg `scroll` (ile wierszy od dołu; 0 = najnowsze) i zawsze
  mieści się w budżecie `rows` — wskaźniki „↑/↓ więcej" zabierają wiersz z okna.
  **Inwariant scrolla:** `maxScroll = vlines - rows + 1` (górny wskaźnik „↓" zabiera
  wiersz, więc bez `+1` najstarszych wpisów nie da się odsłonić) — `App.jsx`
  i `LogPane` MUSZĄ liczyć tak samo. Test: `node apps/cli/test/logpane-scroll.mjs`),
  `Divider` (znak `─`, kolor `#82bbff`), `Picker`
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
  wysokość okna, dokleja kopię („rozdwojenie"). Dlatego: (1) długie linie są
  obcinane `truncate-end` (pełne linie odsłania scroll logu albo tryb zawijania
  `/wrap`; `LogPane` i tak pilnuje budżetu wierszy), (2) listy są „okienkowane” przez
  `window.js` (`windowList`) z
  wysokością liczoną z `termRows` i wskaźnikami `↑/↓ więcej`, (3) log chowa się
  gdy otwarta paleta, (4) input przypięty do dołu. Przy zmianach layoutu pilnować,
  by suma wysokości ≤ `termRows`.
- **Wypełnianie wysokości (input na dole)**: gdy okno jest sensownie wysokie
  (`fillHeight = termRows >= 16`), root dostaje `height={termRows-1}`, a obszar
  logu w trybie `input` ma `flexGrow={1}` + `justifyContent="flex-end"` — input
  stoi stabilnie na dole, a log rośnie w górę i wypełnia okno (bez sztywnego
  limitu; `logRows = termRows - HEADER - progress - 3`). Na niskim oknie
  `height` jest `undefined` → naturalny przepływ (flexGrow zwija się do treści),
  więc nic nie wystaje. **`HEADER` musi odpowiadać REALNEJ wysokości nagłówka**
  (non‑stacked = 8: marginTop 1 + logo 6 + górny divider 1; logo zawsze dominuje
  nad kolumną informacji): za duża → pusta linia nad logiem, za mała →
  przepełnienie. Zasadę layoutu (w tym brak pustej linii) sprawdza
  `node apps/cli/test/fill-height.mjs`.
- **Slash‑komendy** (`commands.js`, `buildCommands(ctx)`): `/connect /login
  /shops /templates /conflicts /git /open /lang /logout /wrap /clear /remove
  /exit(quit)`. `/wrap` przełącza zawijanie logów (alternatywne wyświetlanie).
  Wpisanie `/` filtruje paletę; lista startowa „Połącz ze sklepem"
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
szablonów, alt‑screen, okienkowanie list, repo git w trybie `0`. Nowsze (CLI):
przebudowa konfliktów na ekran `/conflicts` (akcje pojedyncze + seryjne z
potwierdzeniem, 3 znaczniki czasu, „która strona nowsza"), cykliczne przeliczanie
konfliktów w tle (`POLL_MS`, bez `/refresh`), responsywny nagłówek (2 kolumny ↔
2 wiersze, pełne przerysowanie przy resize, spacery 100%), log na ekranie głównym
przewijany kółkiem/strzałkami + tryb zawijania `/wrap` (zamiast osobnego widoku),
oraz wypełnianie wysokości okna z inputem przypiętym do dołu. Najnowsze: logi z
podziałem na kanały (scope) i trwałą historią per‑szablon (`logs/<tplId>.jsonl`,
wczytywanie poprzedniej sesji z separatorem), oraz ignorowanie Ctrl+C (wyjście
tylko przez `/exit`).

Znane/otwarte tematy: pełne i18n logów (część PL na sztywno); ewentualne
ulepszenia czytelności logów (ikony poziomów `✓/ℹ/✗`, „Pobrano/Wysłano" zamiast
etykiet przycisków, krótszy identyfikator pliku); brak `git clone/pull` z remote
(współpracownik nie zaciągnie historii przez aplikację); desktop dostaje zdarzenie
`progress`, ale nie ma jeszcze UI loadera startu. Migracja: stare repo git z
poziomu szablonu nie jest automatycznie przenoszone do `0`.

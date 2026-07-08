# CLAUDE.md

Wskazówki dla przyszłych sesji pracujących nad tym repozytorium.

> Dodatkowe, bardziej szczegółowe wskazówki żyją w plikach `CLAUDE.md` obok
> kodu, którego dotyczą — ładują się automatycznie, gdy pracujesz w danym
> katalogu: `apps/cli/CLAUDE.md` (Ink/TUI — layout, scroll, kolory, slash‑komendy),
> `apps/desktop/CLAUDE.md` (redesign, Storybook, MCP designu).

## Czym jest projekt

**Liquid Flow** — narzędzie do synchronizacji i hot‑reloadu szablonów Liquid w
sklepach **Comarch e‑Sklep**. Edytujesz pliki lokalnie, a zmiany lecą od razu na
serwer sklepu (SOAP). Trzy „skóry" nad wspólnym rdzeniem, połączone przez jeden
współdzielony daemon (patrz niżej):

- **Desktop** (Electron) — `apps/desktop`, GUI React, ikona w tray, build do
  .dmg/.exe/.AppImage.
- **CLI** (`liquidflow`) — `apps/cli`, interaktywny TUI w Ink (React w terminalu).
- **MCP** (`liquidflow-mcp`) — `apps/mcp`, serwer MCP dla agentów AI.

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
    daemon/        liquidflow-daemon: jeden Controller, wielu cienkich klientów
      server.js      proces daemona — trzyma jedyny `Controller`, nasłuchuje na
                      lokalnym unix-socket/named-pipe
      client.js      `connectController()` / `DaemonClient` — RPC do serwera,
                      auto-spawn daemona przy pierwszym użyciu
      protocol.js    kontrakt RPC (mapowanie metod, broadcast zdarzeń)
  bin/liquidflow-daemon.js  entrypoint procesu daemona
  index.js         publiczny barrel export
apps/desktop/    @liquidflow/desktop — electron/ (main.js, preload.cjs) + renderer/ (Vite+Tailwind+shadcn)
apps/cli/        @liquidflow/cli — bin/liquidflow.js + src/ (Ink)
apps/mcp/        @liquidflow/mcp — serwer MCP dla agentów AI (bin/liquidflow-mcp.js + src/server.js)
```

**Wzorzec kluczowy:** `core` nie importuje Electrona ani Ink/React. `Controller`
trzyma cały stan i emituje zdarzenia.

**Współdzielony daemon (`liquidflow-daemon`)**: wszystkie trzy apki łączą się z
**jednym** procesem daemona zamiast budować własny `Controller` w procesie —
dzięki temu sklep/szablon/hasło zapisane w jednej apce są od razu widoczne w
pozostałych, a dwie apki na tym samym szablonie nie dublują watcherów. Każda
apka woła `await connectController({ insecureTLS })` z `@liquidflow/core`
(`apps/cli/src/useController.js`, `apps/mcp/bin/liquidflow-mcp.js`,
`apps/desktop/electron/main.js`) — to zwraca `DaemonClient`, który auto‑spawnuje
`liquidflow-daemon` przy pierwszym użyciu, jeśli jeszcze nie działa, i łączy się
przez lokalny unix‑socket/named‑pipe. Daemon kończy proces sam, gdy odłączy się
ostatni klient (brak osieroconych procesów). `LIQUID_FLOW_NO_DAEMON=1` wymusza
dawne zachowanie in‑process (bez daemona) — przydatne do debugowania w izolacji.
Wszystkie apki muszą wskazywać na ten sam katalog danych (`LIQUID_FLOW_HOME` /
`defaultAppDir()`), inaczej dostaną osobne daemony i nie będą dzielić stanu.

`DaemonClient` udostępnia ten sam interfejs zdarzeń co lokalny `Controller`
(przezroczyste dla apek — subskrybują identycznie jak przed migracją na daemona):

- `log` — nowy wpis logu `{ Id, TS, Text, Color, kind?, historic?, msg?, params? }`
  (`msg`+`params` = deskryptor i18n, `Text` renderowany dla bieżącego języka)
- `log:reset` — pełna podmiana bufora po przełączeniu kanału **lub zmianie języka**
- `mismatches` — lista konfliktów
- `state` — `{ currentShop, currentTemplate, language, insecureTLS }`
- `git` — status repo (gitStatus)
- `progress` — etapy startu synchronizacji (`download`/`check`/`ready`)

Desktop mostkuje to przez IPC (`electron/preload.cjs` → `window.api`,
`electron/main.js` → handlery, teraz nad `DaemonClient` zamiast lokalnego
`Controller`). CLI subskrybuje bezpośrednio w `apps/cli/src/useController.js`.

Historia migracji na daemon i decyzje projektowe: `plans/022`–`030` (wszystkie
`DONE`; `plans/README.md` ma pełne rationale i kolejność wdrożenia).

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
wołają `logInfo/logOk/logErr` bez wiedzy o kanale; wpis trafia do bieżącego.

**Logi są i18n‑świadome (tłumaczone na żywo).** Argument log‑funkcji to ALBO
literał (string — np. surowy `e.message`, stderr gita: zostaje jak jest), ALBO
**deskryptor i18n** `tmsg(key, params)` → `{ msg, params }`. `log.js` trzyma
bieżący język i renderuje `Text` z deskryptora; `log.setLanguage(lang)` (wołany
przez `Controller.setLanguage`) przelicza `Text` wszystkich wpisów z deskryptorem
w aktywnym kanale i emituje `'reset'` → cały widoczny log (i wczytana historia)
zmienia język. Separator ma wariant `separator({ key, ts })` (klucz + czas;
data formatuje się wg `localeFor`). **Zasada: log‑producenty nie sklejają
przetłumaczonych łańcuchów — przekazują `tmsg('Klucz', params)`**; literały tylko
dla tekstu nietłumaczalnego (wyjątki/stderr — te zostają w języku z chwili błędu).

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
linii). W linii zapisujemy też deskryptor i18n (`msg`/`params` lub `sepKey`/
`sepTs`) obok `Text`, więc po ponownym wczytaniu historia renderuje się w
bieżącym języku (stare pliki bez deskryptora → fallback do zapisanego `Text`).
Plik żyje **poza** `files/<id>/`, więc nie trafia do synchronizacji ani do repo
git szablonu. Przy starcie sesji (`_startSession`) Controller: wczytuje ogon
historii (wpisy dostają `historic:true` → wyszarzone w `LogPane`), dokłada
`logbuf.separator({ key:'NewSession', ts })` (`kind:'separator'`, renderowany jako
linia działowa „── … ─────"), dopiero potem płynie nowa sesja. `buildVlines`
obsługuje oba pola: separator (kolor `#82bbff`, pełna szerokość) i `historic`
(`dimColor`).

## Delegowanie podzadań do Gemini/Antigravity (MCP)

Główny model sesji (Sonnet) może delegować pojedyncze podzadania do Gemini przez
serwer MCP **`gemini-mcp-tool`** (zarejestrowany w `.mcp.json`, `npx -y
gemini-mcp-tool`). Serwer nie używa klucza API — w tle uruchamia lokalnie
zainstalowany **Antigravity CLI (`agy`)**, następcę Gemini CLI (Google wygasił
Gemini CLI dla kont darmowych/AI Pro/AI Ultra 2026‑06‑18), zalogowany przez OAuth
na koncie Google z subskrypcją AI Pro/Ultra — zużywa limit tego konta, bez
osobnego billingu API. Warunek: `agy` musi być zainstalowany i zalogowany
lokalnie (`agy auth status`) — to jednorazowy, interaktywny krok użytkownika, nie
da się go wykonać z poziomu sesji agenta.

Narzędzia dostępne przez ten MCP:
- `ask-gemini` — prompt + opcjonalne odwołania do plików (`@ścieżka`), do analizy
  dużych zbiorów plików/kontekstu wykraczającego poza wygodne okno Sonnet.
- `sandbox-test` — uruchomienie/przetestowanie fragmentu kodu w izolowanej
  piaskownicy Gemini (jednorazowe sprawdzenie, nie kod do wklejenia bez przeglądu).

Kiedy sięgać: przeszukiwanie/analiza dużych zbiorów plików lub logów,
prototypowanie kodu do szybkiego sprawdzenia, research wymagający dużego okna
kontekstu. To NIE jest zamiennik `advisor()` (Opus/Fable) — `advisor()` to druga
opinia/recenzja nad tokiem pracy Sonnet, `ask-gemini`/`sandbox-test` to wykonawcze
narzędzie do konkretnych, zlecanych podzadań; oba mechanizmy działają niezależnie
i mogą być używane w tej samej sesji. Automatyzacja `agy` przez CLI podlega
zasadom Google dla kont AI Pro/Ultra — to nie jest oficjalny kanał API, więc przy
dużym wolumenie zapytań może podlegać throttlingowi konta.

## Tłumaczenia (i18n) — PL/EN

Aplikacja jest w pełni dwujęzyczna (polski + angielski). Jedno źródło prawdy:
`packages/core/src/translations.js` — dwie **płaskie tablice** `pl` i `en`
(`en` to `{ ...pl, …nadpisania }`) plus helpery `tfmt`, `translationsFor`,
`localeFor`, `LANGUAGES`, `LOCALES`. Tablica trzyma **wyłącznie stringi** (jest
serializowana przez IPC do desktopu — żadnych funkcji).

> **ZASADA TWARDA: każdy nowy tekst widoczny dla użytkownika MUSI mieć wpis w
> obu tablicach (`pl` i `en`).** Nie hardkoduj łańcuchów w `controller.js`,
> `syncEngine.js`, `soap.js`, `commands.js`, komponentach CLI ani w rendererze
> desktopu — dodaj klucz do `translations.js` i sięgnij po niego. Po dodaniu
> zweryfikuj parytet (patrz niżej).

**Teksty z dynamiczną wstawką** używają tokenów `{nazwa}` i są składane przez
`tfmt(str, params)` (np. `tfmt(t.ConnectedToShop, { name })`). W rendererze
desktopu unikaj tokenów — składaj wartość w JSX z osobnych słów‑kluczy (np.
`{git.commitCount} {t.Versions}`), bo renderer nie wywołuje `tfmt`.

Jak `t` (tablica dla bieżącego języka) trafia do warstw:
- **core**: `Controller` ma getter `get t()`; `SyncSession`/`ISklep24Client`
  dostają `language` w opcjach i trzymają własne `this.t` (do **rzucanych
  błędów**, które renderują się w chwili rzutu). **Logi** idą jako deskryptory
  `tmsg('Klucz', params)` i tłumaczą się na żywo (patrz sekcja „Logi"). Język
  siedzi w `config.Language`; `setLanguage` zapisuje config, woła
  `logbuf.setLanguage` (przerysowanie logu → `log:reset`) i emituje `state`.
  Komunikaty commitów gita renderuje `controller` przez `tfmt` (to dane repo).
- **CLI**: `useController` wystawia `t` (przeliczane na zdarzeniu `state`);
  `App.jsx` przekazuje `t` do `ctx` (komendy) i jako **prop** do KAŻDEGO
  komponentu, który renderuje tekst (`Header`→`StatusBar`, `Picker`, `Form`,
  `CommandPalette`, `LogPane`). Etykiety statusu (`Sklep/Szablon/Git`) wyrównuje
  się padem liczonym z długości słów, więc działa w obu językach.
- **desktop**: `Controller.getTranslations()` → IPC → `App.jsx` (`t` w kontekście
  `useApp()`). Komponenty czytają `t.Klucz`. Tray w `electron/main.js` dostaje
  `t` przy starcie.

Warstwa VCS (`git.js`) celowo trzyma **angielskie** stringi techniczne (komunikaty
commitów/błędy plumbingu to dane repo, nie UI); teksty widoczne w historii
(np. komunikat „restore") przekazuje `controller.js` już przetłumaczone. Opisy i wyniki
narzędzi serwera MCP (`apps/mcp`) również są w języku angielskim jako kontrakt API.

**Weryfikacja po zmianach i18n** (uruchamiać z katalogu repo):
- parytet kluczy + brak „nieprzetłumaczonych" (en === pl, a w treści są polskie znaki):
  `node -e "import('@liquidflow/core').then(m=>{const pl=m.translationsFor('pl'),en=m.translationsFor('en');const pc=/[ąćęłńóśźż]/i;console.log('untranslated:',Object.keys(pl).filter(k=>en[k]===pl[k]&&pc.test(pl[k])))})"`
- brak hardkodowanego polskiego tekstu poza `translations.js` (skan diakrytyków
  w stringach/JSX; pamiętaj też o słowach bez diakrytyków typu „lub/sklep/brak").
- render obu języków: ustaw `LIQUID_FLOW_HOME` na świeży katalog z
  `config.json` = `{"Language":"en","Shops":[]}` i wyrenderuj `App.jsx` do
  sztucznego stdout (jak w `apps/cli/test/*`).

## Konwencje kodu

- **ESM** wszędzie (`"type":"module"`), Node 18+.
- **Język / i18n**: **cały tekst widoczny dla użytkownika** (UI, logi, błędy,
  tray) przechodzi przez `translations.js` (`pl`/`en`) — zero hardkodowanych
  łańcuchów w warstwach prezentacji. Szczegóły i twarda zasada „nowy tekst =
  wpis PL **i** EN" — patrz sekcja „Tłumaczenia (i18n) — PL/EN" niżej.
  Komentarze w kodzie — patrz zasady niżej.
- **Komentarze w kodzie (OBOWIĄZKOWE)**: zawsze **wyłącznie po angielsku**,
  niezależnie od tego, że reszta tej dokumentacji i UI aplikacji jest po
  polsku. Mają być **profesjonalne i opisowe** — wyjaśniają PO CO dany
  fragment istnieje albo jaki nieoczywisty niuans/ograniczenie reprezentuje,
  a nie CO robi kod linijka po linijce (to widać z samego kodu). Zabronione:
  ślady procesu edycji lub konwersacji z czatem — żadnych „usunięto X”,
  „zmieniono na żądanie użytkownika”, „naprawiono zgodnie z prośbą”, „TODO:
  do przejrzenia po rozmowie” itp. Komentarz ma być tak samo aktualny i
  bezstronny, jakby ktoś pisał go od zera, patrząc tylko na finalny kod.
- **Styl**: dopasuj się do otaczającego kodu; zwięzłe funkcje; bez nadmiarowych
  zależności (np. spinner/okno napisane ręcznie, nie z paczek).
- **Commity**: Conventional Commits po angielsku (`feat(cli): …`, `fix(git): …`,
  `style(cli): …`). **Bez** stopki „Co-Authored-By". **Workflow**: po każdym
  prompcie/zadaniu — commit + `git push origin main`. Wiadomość: typ zmian
  (feat/fix/style/etc.) + krótkie streszczenie (jedna linia, co się zmieniło).
  Pracujemy bezpośrednio na `main`. Remote:
  `git@github.com:iTzRitual/comarch-liquid-sync-2026.git`.
- **Wersjonowanie (OBOWIĄZKOWE przy każdym commicie)**: przed każdym commitem
  zwiększ numer patch w `version` o 1 we **wszystkich czterech** plikach
  jednocześnie: `package.json` (root), `apps/cli/package.json`,
  `packages/core/package.json`, `apps/mcp/package.json`. Aktualną wersję odczytaj z jednego z tych plików
  (są zawsze zsynchronizowane). Przykład: `0.9.91` → `0.9.92`. Minor (`0.X.0`)
  zwiększamy tylko przy dużych kamieniach milowych (nowa funkcja o istotnym
  zakresie). **Nigdy nie commituj bez zbumpowania wersji.**
- **Higiena pracy na równoległych worktree (OBOWIĄZKOWE przy wielu wykonawcach)**: gdy kilka planów/wykonawców pracuje jednocześnie w osobnych **git worktree** (np. równoległe migracje 023/024/025), przed scaleniem należy **zrobić rebase lub squash każdej gałęzi na aktualny `main`** i scalać je **pojedynczo**, wykonując bump wersji w momencie scalania. Naiwne scalanie równoległych worktree tworzy zduplikowane commity i powoduje tysiące linii zbędnych zmian w `package-lock.json` (jak przy migracjach daemona wokół commita `e79d473`). Dopuszczalny jest jeden czysty commit na plan; przed pushem należy sprawdzić w `git log --oneline`, czy nie ma zduplikowanych wiadomości.
- **Changelog (`CHANGELOG.md`, OBOWIĄZKOWE przy każdym commicie)**: po zbumpowaniu
  wersji dopisz nową sekcję na górze pliku (pod nagłówkiem `# Changelog`) w formacie:
  ```
  ## [X.Y.Z] — YYYY-MM-DD
  ### Added / Changed / Fixed / Removed
  - krótki opis zmiany (po angielsku, 1–2 zdania)
  ```
  Używaj kategorii Keep a Changelog: `Added` (nowe), `Changed` (modyfikacje),
  `Fixed` (bugi), `Removed` (usunięte). Wpisuj tylko to, co zmieniła bieżąca
  sesja — nie powielaj starszych wpisów.
- **Bramka testów przed commitem (OBOWIĄZKOWE)**: po KAŻDEJ zmianie kodu, ZANIM
  zacommitujesz, uruchom `npm test`. Musi być **w 100% zielone**. Jeśli coś jest
  czerwone:
  1. Najpierw ustal, czy to **regresja** (zepsuty kod produkcyjny) czy **test
     wymagał aktualizacji** (świadoma zmiana zachowania).
  2. Regresja → **napraw kod**, nie „podkręcaj" testu pod zły wynik. Test zmieniaj
     tylko, gdy zachowanie zmieniło się celowo — wtedy zaktualizuj asercję, by
     opisywała nowe, poprawne zachowanie.
  3. Dopiero gdy `npm test` przechodzi → commit + push.
  Dodatkowo, zależnie od obszaru zmiany: dotykasz `bin/liquidflow.js`/bootu CLI/
  pty → także `npm run test:e2e`; zmieniasz teksty UI → kontrola parytetu i18n
  (sekcja „Tłumaczenia"). Nowa logika = nowy/zmieniony `*.test.js` w tym samym
  commicie (patrz „Zasada" w sekcji Testy). Nie commituj kodu z czerwoną suitą,
  żeby „naprawić później".
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

## Testy (Vitest)

Siatka testów chroni rdzeń przed regresją przy iteracjach. **Runner: Vitest**
(jeden dla całego monorepo, natywne ESM). Konfiguracja: `vitest.config.js`
(root). Uruchamianie:

```bash
npm test           # vitest run — unit/integracja/komponenty (szybkie, deterministyczne)
npm run test:watch # tryb watch
npm run test:cov   # z pokryciem
npm run test:e2e   # e2e CLI pod pseudo-TTY (wolniejsze, OSOBNY config — NIE w `npm test`)
```

- **Lokalizacja**: testy leżą **obok źródeł** — logika jako `*.test.js`
  (`packages/core/src/*.test.js`, `apps/cli/src/*.test.js`), komponenty Ink jako
  `*.test.jsx` (`apps/cli/src/components/*.test.jsx`; JSX klasyczny — komponenty
  importują `React`). Ręczne skrypty render‑smoke (`apps/cli/test/*.mjs`) zostają
  jako szybki podgląd wizualny — odpalasz je przez `node`, Vitest ich **nie**
  zbiera (`include` celuje w `*.test.js`/`*.test.jsx`).
- **Komponenty Ink (interakcje)**: `ink-testing-library` (`render` → `lastFrame()`
  + `stdin.write`). Helper `test/helpers/ink.js`: `keys` (strzałki/Enter/Esc jako
  sekwencje), `press(stdin, ...keys)` (czeka na re‑render; **pierwszy tick puszcza
  subskrypcję `useInput`** — bez tego pierwszy klawisz ginie), `frame(api)`
  (klatka bez ANSI). Layout o ZADANEJ szerokości (ink‑testing‑library ma sztywne
  `columns=100`) testuje `renderFrame(el, cols)` — używany przez `Header.test.jsx`
  (anty‑przepełnienie: żaden wiersz > `cols`, logo nie pęka). Pokryte:
  `Picker`/`Form`/`ConflictList`/`ConnectList` (nawigacja, wybór, Esc, toggle),
  `LogPane` (budżet wierszy + scroll), `Header` (szerokości). `commands.test.js`
  sprawdza wiązanie slash‑komend i **bezpieczny domyślny wybór** w `/conflicts`
  (kursor nigdy nie startuje na akcji usuwającej).
- **Izolacja stanu na dysku**: `test/setup/tmpHome.js` (setupFile) tworzy świeży
  `LIQUID_FLOW_HOME` (tmp‑dir) **per plik testowy**, ZANIM `store.js` policzy
  `APP_DIR` przy imporcie, i sprząta po `afterAll`. W obrębie jednego pliku testy
  współdzielą ten katalog → **izoluj nazwą sklepu** (`TestShop${n++}`), nie licz
  na czysty dysk między `it()`.
- **Mock SOAP**: `test/helpers/mockSoapServer.js` to lokalny `http.createServer`
  udający `iSklep24Service.asmx`. Klient wskazujesz na `srv.url` (domyślnie
  `http://127.0.0.1:PORT`; opcja `{ host:'localhost' }` + `srv.port` dla testów
  `signInShop`, którego walidacja URL wymaga `https://` LUB `http://localhost:…`)
  — testy integracyjne `ISklep24Client`/`Controller` chodzą po PRAWDZIWYM
  gnieździe bez sieci. `handlers[Metoda] = (req) => wynik` (string/bool →
  `<MethodResult>`, `{resultXml}`, `{fault}`, `{setCookie}`, `{raw}`);
  `srv.requests` przechwytuje żądania; `liquidTemplateXml({…})` buduje
  `<LiquidTemplate>` do odpowiedzi `Liquid_FilesGet`/`MetaGet`.
- **Wstrzykiwanie klienta / mock URL**: `new SyncSession(shop, tpl, { client })`
  wstrzykuje atrapę klienta (logika konfliktów/sync/`command()`/watcher na realnym
  `store`). `Controller` NIE ma wstrzyknięcia klienta — buduje go z `shop.Url`,
  więc w testach seedujesz sklep z `Url` wskazującym na mock SOAP
  (`controller.test.js`, `controller.session.test.js`: connect → `selectTemplate`
  → start sesji → git).
- **Izolacja stanu współdzielonego (WAŻNE)**: pliki o STAŁEJ ścieżce w tmp home
  (`config.json`, plik `.key`) są wspólne dla testów w obrębie jednego pliku.
  Testy pracujące na configu MUSZĄ czyścić `store.paths.CONFIG_PATH` w `beforeEach`
  (inaczej padają pod `--sequence.shuffle` — stan sklepu/języka wycieka). Testy
  plikowe (store/sync/git) izoluj UNIKALNĄ nazwą sklepu (`Shop${n++}`) i/lub
  własnym `mkdtempSync`. Controllery twórz per‑test i `dispose()` w `afterEach`
  (odpinają globalne nasłuchy `logbuf`); resetuj kanał logu `logbuf.setActiveChannel('app')`.
- **Pokrycie (`npm run test:cov`, `@vitest/coverage-v8`)**: ~82% linii rdzenia+CLI.
  Warstwy: `git.test.js` (PRAWDZIWY `git` w tmp‑repo, push do lokalnego bare; cała
  suita pomijana gdy brak gita), `controller*.test.js` (sesja/sklepy/język/git
  przez mock SOAP), `syncEngine.watcher.test.js` (`_processChange` hot‑reload,
  `_initialDownload`, `start/dispose`, `_pollRefresh`), `syncEngine.command.test.js`
  (`download`/`upload`/`removeLocal/Remote`/`*All`/`refresh`), `soap.methods.test.js`
  (reszta kontraktu: `Unlock`/`FileIsValid`/`Add`/`Set`/`Delete`/`Rename`),
  `commands.flows.test.js` (strażnicy, `/settings`+język, routing `/connect`, menu
  `/git`, **potwierdzenie akcji usuwających**). Świadomie poza pokryciem: `open.js`
  (spawn OS), wrappery git w controllerze delegujące do `git.js`, submit formularzy
  CLI. Cel: najważniejsze ścieżki regresji, nie 100%.
- **E2e CLI (czarna skrzynka, `node-pty`)**: osobny config `vitest.e2e.config.js`
  (`npm run test:e2e`), pliki `apps/cli/test/e2e/*.e2e.js`. Helper
  `test/helpers/cliPty.js` (`startCli`/`makeHome`/`keys`) odpala **prawdziwy**
  `bin/liquidflow.js` pod pseudo‑TTY (CLI wymaga TTY: alt‑screen + raw mode),
  wpisuje klawisze i czeka na tekst (`waitFor`). `makeHome(config)` seeduje
  `config.json` — np. zapisany sklep z `Url` wskazującym na **mock SOAP** z
  Fazy 1 (osobny proces testowy, realne gniazdo): `connect.e2e.js` przechodzi
  ConnectList → SignIn → Liquid_Get → picker szablonów przez całą binarkę.
  **Trzy pułapki** (zakodowane w helperze, nie ruszać): (1) node‑pty rozpakowuje
  prebuilt `spawn-helper` BEZ bitu `+x` → `posix_spawnp failed`; `ensureSpawnHelper()`
  robi `chmod` (samonaprawa, przeżywa `npm install`). (2) **Nie** ustawiać `CI=1`
  — Ink wtedy nie renderuje (pusty ekran). (3) Vitest wstrzykuje do workerów
  `NODE_OPTIONS`/`VITEST_*`/`TINYPOOL_*` — dziedziczone przez spawnięty `node`
  rozbijają start CLI; helper je czyści z otoczenia dziecka. E2e jest **wyłączone
  z `npm test`** (wolne/mniej deterministyczne) — własny config, `fileParallelism:
  false`, jeden worker.
- **Zasada**: każdy nowy moduł logiki w `core` (lub czysta logika CLI jak
  `window.js`) dostaje `*.test.js`. Nowy tekst i18n → test parytetu PL/EN już to
  łapie (`translations.test.js`). Pozostałe tory Fazy 3 (do zrobienia): renderer
  web (`@testing-library/react`+jsdom; wymaga atrapy `window.api` z preload) oraz
  e2e desktop (Playwright `_electron` na zbudowanym Electronie).

## Otwarte tematy

Znane/otwarte: ewentualne ulepszenia czytelności logów (ikony poziomów
`✓/ℹ/✗`, „Pobrano/Wysłano" zamiast etykiet przycisków, krótszy identyfikator
pliku); brak `git clone/pull` z remote (współpracownik nie zaciągnie historii
przez aplikację); desktop dostaje zdarzenie `progress`, ale nie ma jeszcze UI
loadera startu; stare repo git z poziomu szablonu nie jest automatycznie
przenoszone do `0`.

> Historia tego, co zostało zrobione i kiedy, żyje w `CHANGELOG.md` i
> `plans/README.md` (statusy planów) — nie duplikuj jej tutaj.

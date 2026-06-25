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

- `log` — nowy wpis logu `{ Id, TS, Text, Color, kind?, historic?, msg?, params? }`
  (`msg`+`params` = deskryptor i18n, `Text` renderowany dla bieżącego języka)
- `log:reset` — pełna podmiana bufora po przełączeniu kanału **lub zmianie języka**
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
- **Nawigacja wstecz (Esc cofa o jeden ekran, nie do inputu)**: każda otwierana
  nakładka dostaje wskaźnik `mode.parent` (ekran, z którego przyszliśmy). Esc
  (`onCancel` w komponentach → `cancelTo(mode)` w `App.jsx`) pokazuje rodzica, a
  dopiero z ekranu najwyższego poziomu wraca do inputu. Rodzic jest przenoszony
  przez **asynchroniczne** otwarcia (loader → ekran) w `pendingParentRef`:
  ustawiamy go w momencie interakcji użytkownika — wrappery `onSelect`/`onSubmit`
  (picker/form) oraz `onShop`/`onAction`/`onBulk` (connect/conflicts) zapisują
  `pendingParentRef = self` tuż przed handlerem; helper otwierający kolejną
  nakładkę konsumuje go przez `takeParent()` i wpina jako `parent`. Czyszczony przy
  starcie komendy (`onSubmit`/boot — skok od inputu nie ma rodzica) i w `cancelTo`.
  **Ekran `/conflicts` ma `parent: null`** (zawsze wchodzony z inputu; jego
  potwierdzenia dostają ten ekran jako rodzica, więc Esc z potwierdzenia wraca do
  listy konfliktów). Picker/Form nadal zamykają się do inputu **po wyborze**
  (`back()` w wrapperze) — `parent` zmienia tylko zachowanie **Esc**, nie wyboru.
  Gdy zapamiętany rodzic przestaje być aktualny (np. po `init` ekran „brak repo”
  znika), handler woła `ctx.dropParent()` przed otwarciem kolejnego widoku, by Esc
  wrócił do inputu zamiast do nieaktualnego ekranu. **Asynchroniczne re‑otwarcia**
  (np. `gitEnable()` → `gitMenu()`) idą przez `withLoading`, a nie `safe` — `back()`
  w wrapperze pickera zdążyłby wyrenderować „goły” input przed otwarciem widoku
  (mignięcie ekranu głównego); spinner loadera trzyma kadr do czasu otwarcia.
  `withLoading(label, fn, title?)` przyjmuje opcjonalny `title` nadpisujący domyślny
  nagłówek loadera (`t.SelectTemplate`).
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
  tekstowe i `type:'choice'` Tak/Nie strzałkami), `ConflictList` (dedykowany
  ekran `/conflicts` — patrz niżej), `ConnectList` (dedykowany ekran `/connect`:
  lista sklepów ↑/↓ + wiersz akcji w stopce Rozłącz/Dodaj/Usuń, ←/→ i ↑/↓ chodzą
  po przyciskach w tej samej kolejności — patrz niżej), `ProgressView`+`Spinner`
  (loader pobierania/sprawdzania), `CommandPalette`. Layout nagłówka testuje się
  na różnych szerokościach: `node apps/cli/test/header-widths.mjs`.
- **`ConflictList.jsx` (ekran `/conflicts`)** — NIE używa `Picker` (inny model
  layoutu). Każdy plik to **karta 3‑wierszowa**: (1) nazwa do lewej
  (`truncate-end`) + przyciski akcji do prawej (`flexShrink=0`), (2) metadane
  (znaczniki czasu + która strona nowsza), (3) pusta linia. Na dole stała stopka:
  pusta linia + jeden wiersz operacji seryjnych (Pobierz/Wyślij wszystkie).
  Nawigacja: `↑/↓` między kartami i stopką, `←/→` wybór akcji w wierszu, `Enter`
  wykonuje, `Esc` anuluje. **Akcje są dopasowane do typu konfliktu** (2 opcje):
  Timestamp → Pobierz/Wyślij; LocalMissing → Pobierz/Usuń w sklepie; RemoteMissing
  → Wyślij/Usuń lokalnie. Domyślny wybór nigdy nie jest usuwaniem; usuwanie idzie
  przez potwierdzenie (`confirmStay` — „Nie" wraca do listy). **Kursor ←/→ należy
  tylko do bieżącego wiersza i NIE jest pamiętany** (jeden stan `cursor`, nie mapa
  per‑plik): wejście na kartę (↑/↓) resetuje go do bezpiecznego `initial`, bo
  liczy się dopiero Enter (działa natychmiast na bieżącej karcie). Wszystkie
  przyciski są **pełnokontrastowe** (`color` domyślny); podświetlenie (tło `cyan`,
  tekst `black`) ma WYŁĄCZNIE kursor `focused` wiersza — żadnych szarych
  „niewybranych". Po akcji lista
  odświeża się i zostaje otwarta (rozwiązujesz kolejne pliki bez ponownego
  `/conflicts`). Okienkowanie kart przez `windowCards(n, idx, budżet, 3)` w
  `window.js` (stała wysokość karty = 3 wiersze, wskaźniki `↑/↓ więcej`). **Uwaga
  o emoji:** w przycinanym wierszu metadanych NIE używać emoji z `U+FE0F`
  (📄💾☁️) — bywają liczone jako 1, a rysowane jako 2 znaki, co łamie prawą
  ramkę; w przyciskach (flex‑box mierzony Yogą, np. 🗑) jest OK.
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
- **Kolory / kontrast — adaptacja do motywu terminala (NIE psuć!)**: CLI musi być
  czytelne na **ciemnym I jasnym** tle terminala. Twarde reguły:
  1. **Tekst podstawowy → bez `color`** (domyślny foreground terminala: jasny na
     ciemnym, ciemny na jasnym). NIGDY `color="white"` jako zwykły foreground —
     znika na białym terminalu (był to bug). Dotyczy m.in. niezaznaczonych pozycji
     list (`Picker`/`ConnectList`/`ConflictList`) i domyślnego wpisu logu
     (`LogPane.inkColor` mapuje `#FFF` → `undefined`, nie `'white'`).
  2. **Podpowiedzi / tekst drugorzędny → `dimColor` BEZ `color="gray"`.** `gray`
     to ANSI bright‑black (~#666), a `dimColor` (SGR 2) przygasza go jeszcze
     bardziej → na czarnym tle prawie niewidoczne (podwójne przyciemnienie). Samo
     `dimColor` przygasza domyślny foreground → czytelne na obu tłach. Dotyczy
     stopek nawigacji i wskaźników „więcej ↑/↓" we wszystkich ekranach.
  3. **`white`/`black` tylko z jawnym `backgroundColor`** (pigułki zaznaczenia, np.
     `color="black" backgroundColor="cyan"`) — tam tło jest jawne, więc OK.
  4. Akcenty (cyan/blue `#82bbff`/green/red/magenta/yellow, orange `#ff5a1f`)
     niosą semantykę i są widoczne na obu tłach — zostają.
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
  wysokością liczoną z `termRows` i wskaźnikami `↑/↓ więcej`, (3) input/paleta/
  ekrany przypięte do dołu (log wypełnia górę). Przy zmianach layoutu pilnować,
  by suma wysokości ≤ `termRows`.
- **Strefa akcji zawsze na dole, log zawsze nad nią (NIE psuć!)**: jedna zasada
  dla wszystkich trybów — to, z czym użytkownik wchodzi w interakcję (input,
  paleta slash, ekrany picker/form/conflicts/connect/loading), lgnie do **dołu**
  okna, a log jest kontekstem **nad** nim i nigdy nie znika. Dzięki temu oko nie
  skacze góra↔dół przy zmianie trybu (był to świadomy redesign — wcześniej slash
  chował log, a ekrany były wyrównane do góry).
  - **Slash nie chowa logu** (`input`): układ aktywny (paleta otwarta) to
    **log > divider > podpowiedzi > input**, pasywny (zamknięta) to **log > divider
    > input** — divider zawsze tuż pod logiem, podpowiedzi żyją w strefie akcji nad
    inputem (bez spacera, bez dolnego dividera). `logWithPalette = paletteOpen &&
    showLogWithPalette` (`showLogWithPalette` = `fillHeight` + są wpisy + `logRows
    >= 10`); wtedy `LogPane` (rows `paletteLogRows = logRows - paletteCap`, `dim`) +
    `Divider` + `CommandPalette` (rows `paletteCap = min(filtered.length, logRows-4)`).
    Poniżej progu (brak logu / niskie okno) paleta bierze pełną wysokość
    (`paletteMax`) i nie ma dividera. Divider i paleta są **siblingami** flex‑boxa
    logu (nie wewnątrz), więc log oddaje palecie dokładnie tyle wierszy, ile zajmie.
  - **Log jako tło = wyszarzony**: gdy log jest tłem dla otwartej palety/ekranu,
    `LogPane` dostaje `dim` (wyszarza CAŁY log — `dimColor`, ten sam efekt co
    `historic` dla poprzedniej sesji). Czytelnie mówi „to kontekst, akcja jest
    niżej". Przy palecie rozdziela je divider; przy ekranach (mają własną ramkę)
    — 1 wiersz przerwy (`<Text> </Text>`, wliczony w `ovLogRows`).
  - **Ekrany na dole z logiem nad**: helper `wrapAction(node)` w `App.jsx` owija
    każdą nakładkę w `flexGrow=1`+`justifyContent="flex-end"`, a nad nią wstawia
    `LogPane` (rows `ovLogRows`, `dim`) + wiersz przerwy. **To FUNKCJA, nie komponent** — inaczej Box
    dostaje nową tożsamość co render i React remontuje ekran, gubiąc `useState`
    pickerów. Budżet liczony z DANYCH: `overlayNatural` (ile pozycji + chrome),
    `ovRows = min(natural, overlayAvail - ovReserve)`, `ovMax = ovRows-4` (body),
    `ovLogRows = overlayAvail - ovRows`. Niezmiennik anty‑overflow:
    `ovLogRows + wysokość_ekranu ≤ overlayAvail = termRows - HEADER - 2`. Krótki
    ekran → duży log; długi → ekran się okienkuje, log dostaje minimum (`ovReserve`).
  - Test: `node apps/cli/test/action-bottom.mjs` (picker+paleta, log nad, dół=ekran,
    brak overflow dla `fillHeight`).
- **Wypełnianie wysokości (input na dole)**: gdy okno jest sensownie wysokie
  (`fillHeight = termRows >= 16`), root dostaje `height={termRows-1}`, a obszar
  logu w trybie `input` ma `flexGrow={1}` + `justifyContent="flex-end"` — input
  stoi stabilnie na dole, a log rośnie w górę i wypełnia okno (bez sztywnego
  limitu; `logRows = termRows - HEADER - progress - 3`). Na niskim oknie
  `height` jest `undefined` → naturalny przepływ (flexGrow zwija się do treści),
  więc nic nie wystaje; w tym trybie nakładki wracają do przepływu od góry
  (`wrapAction` przepuszcza `node` bez owijania) — log nad ekranem pojawia się
  tylko przy `fillHeight`. **`HEADER` musi odpowiadać REALNEJ wysokości nagłówka**
  (non‑stacked = 8: marginTop 1 + logo 6 + górny divider 1; logo zawsze dominuje
  nad kolumną informacji): za duża → pusta linia nad logiem, za mała →
  przepełnienie. Zasadę layoutu (w tym brak pustej linii) sprawdza
  `node apps/cli/test/fill-height.mjs`.
- **Slash‑komendy** (`commands.js`, `buildCommands(ctx)`): `/connect /templates
  /conflicts /git /open /clear /settings /exit(quit)`. `/connect` łączy oba
  scenariusze (lista zapisanych sklepów **i** „dodaj nowy") — nie ma osobnych
  `/login`/`/shops`; to **dedykowany ekran `ConnectList`** (NIE `Picker`): lista
  sklepów (↑/↓, Enter = połącz) + wiersz akcji w stopce — Rozłącz sesję / Dodaj
  nowe połączenie / Usuń sklep (dawne `/logout`/`/remove`), wybierane ←/→ (i ↑/↓
  w tej samej kolejności; Rozłącz tylko gdy połączony, Usuń tylko gdy są zapisane
  sklepy). Render: `node apps/cli/test/connectlist-render.mjs`. `/settings` to menu
  preferencji: toggle zawijania logów (dawne `/wrap`, wzorzec togglów z `/git`) +
  wybór języka (dawne `/lang`). Wpisanie `/`
  filtruje paletę; lista startowa „Połącz ze sklepem" otwiera się automatycznie
  gdy niepołączony, a `/` ją przeskakuje. Operacje seryjne (pobierz/wyślij
  wszystkie) nie są osobnymi komendami — to stopka ekranu `/conflicts` (sens mają
  tylko przy konfliktach). Pojedynczy plik rozwiązujesz wprost w wierszu karty
  (`←/→` wybiera akcję, `Enter` wykonuje — patrz `ConflictList` wyżej). **Wejście
  w `/conflicts` najpierw przelicza konflikty na żywo** (`ctrl.recheckMismatches`
  → to samo zapytanie metadanych co poll), żeby decyzje opierały się na świeżym
  stanie sklepu. Wskaźnik konfliktów siedzi w nagłówku (obok logo, nie spycha
  układu) i kieruje do `/conflicts`. Nie ma `/refresh` — `SyncSession` przelicza
  konflikty cyklicznie w tle (`POLL_MS`), wyłapując zmiany po stronie sklepu.

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
(np. komunikat „restore") przekazuje `controller.js` już przetłumaczone.

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
- **Język / i18n**: komentarze w kodzie po polsku; **cały tekst widoczny dla
  użytkownika** (UI, logi, błędy, tray) przechodzi przez `translations.js`
  (`pl`/`en`) — zero hardkodowanych łańcuchów w warstwach prezentacji. Szczegóły
  i twarda zasada „nowy tekst = wpis PL **i** EN" — patrz sekcja „Tłumaczenia
  (i18n) — PL/EN" niżej.
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

## Testy (Vitest)

Siatka testów chroni rdzeń przed regresją przy iteracjach. **Runner: Vitest**
(jeden dla całego monorepo, natywne ESM). Konfiguracja: `vitest.config.js`
(root). Uruchamianie:

```bash
npm test           # vitest run — cały pakiet (CI/jednorazowo)
npm run test:watch # tryb watch
npm run test:cov   # z pokryciem
```

- **Lokalizacja**: testy leżą **obok źródeł** jako `*.test.js`
  (`packages/core/src/*.test.js`, `apps/cli/src/*.test.js`). Ręczne skrypty
  render‑smoke (`apps/cli/test/*.mjs`) zostają — odpalasz je przez `node`, Vitest
  ich **nie** zbiera (`include` celuje tylko w `*.test.js`).
- **Izolacja stanu na dysku**: `test/setup/tmpHome.js` (setupFile) tworzy świeży
  `LIQUID_FLOW_HOME` (tmp‑dir) **per plik testowy**, ZANIM `store.js` policzy
  `APP_DIR` przy imporcie, i sprząta po `afterAll`. W obrębie jednego pliku testy
  współdzielą ten katalog → **izoluj nazwą sklepu** (`TestShop${n++}`), nie licz
  na czysty dysk między `it()`.
- **Mock SOAP**: `test/helpers/mockSoapServer.js` to lokalny `http.createServer`
  udający `iSklep24Service.asmx`. Klient wskazujesz na `srv.url`
  (`http://127.0.0.1:PORT`) — testy integracyjne `ISklep24Client` chodzą po
  PRAWDZIWYM gnieździe bez sieci. `handlers[Metoda] = (req) => wynik`
  (string/bool → `<MethodResult>`, `{resultXml}`, `{fault}`, `{setCookie}`,
  `{raw}`); `srv.requests` przechwytuje żądania.
- **Wstrzykiwanie klienta**: `new SyncSession(shop, tpl, { client })` — testy
  logiki konfliktów/sync wstrzykują atrapę klienta i sprawdzają efekt na realnym
  `store` (tmp‑dir), bez SOAP.
- **Zasada**: każdy nowy moduł logiki w `core` (lub czysta logika CLI jak
  `window.js`) dostaje `*.test.js`. Nowy tekst i18n → test parytetu PL/EN już to
  łapie (`translations.test.js`). Kolejne fazy: komponenty Ink
  (`ink-testing-library`), renderer web (`@testing-library/react`+jsdom), e2e
  (`node-pty` dla CLI, Playwright `_electron` dla desktopu).

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
tylko przez `/exit`). **Pełne i18n (PL/EN)**: cały tekst UI/logów/błędów/tray
przeniesiony do `translations.js`; `core` przekazuje język do `SyncSession`/SOAP,
CLI przekazuje `t` do wszystkich komponentów, desktop czyta `t` z kontekstu —
przełączanie języka działa na żywo w obu apkach (patrz sekcja „Tłumaczenia").
Logi są **strukturalne** (deskryptor `tmsg('Klucz', params)` zamiast gotowego
tekstu) — `/lang` przetłumacza też **już wyświetlone** wpisy i wczytaną historię
(zapis `msg`/`params` w `.jsonl`); literały wyjątków zostają w języku z chwili
błędu.

Znane/otwarte tematy: ewentualne
ulepszenia czytelności logów (ikony poziomów `✓/ℹ/✗`, „Pobrano/Wysłano" zamiast
etykiet przycisków, krótszy identyfikator pliku); brak `git clone/pull` z remote
(współpracownik nie zaciągnie historii przez aplikację); desktop dostaje zdarzenie
`progress`, ale nie ma jeszcze UI loadera startu. Migracja: stare repo git z
poziomu szablonu nie jest automatycznie przenoszone do `0`.

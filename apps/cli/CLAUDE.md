# apps/cli — CLAUDE.md

Szczegóły implementacji CLI (`@liquidflow/cli`, Ink/React w terminalu). Root
`CLAUDE.md` ma architekturę ogólną (daemon, core, i18n, testy, versioning) —
ten plik dotyczy WYŁĄCZNIE tego, co żyje pod `apps/cli`.

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
  **Budżet jest twardy także przy `rows===1`**: `avail` (miejsce na wpisy) NIE jest
  podłogowany do 1 — gdy potrzebny jest wskaźnik „↑", `avail` spada do 0 i pokazuje
  się sam wskaźnik (bez wpisu), zamiast wskaźnik+wpis = 2 wiersze (przepełnienie →
  Ink obcina/dubluje kadr). `LogEmpty` renderuje się tylko gdy log jest naprawdę
  pusty (`total===0`), nie gdy zabrakło miejsca na wpisy.
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
    log lgnie WPROST pod ramkę (bez wiersza przerwy — usunięty, by box nie „pływał").
  - **Ekrany na dole z logiem nad**: helper `wrapAction(node)` w `App.jsx` owija
    każdą nakładkę w `flexGrow=1`+`justifyContent="flex-end"`, a nad nią wstawia
    `LogPane` (rows `ovLogRows`, `dim`) — bez spacera między logiem a ramką.
    **To FUNKCJA, nie komponent** — inaczej Box
    dostaje nową tożsamość co render i React remontuje ekran, gubiąc `useState`
    pickerów. Budżet liczony z DANYCH: `overlayNatural` (ile pozycji + chrome),
    `ovRows = min(natural, overlayAvail)`, `ovMax = ovRows-4` (body),
    `ovLogRows = overlayAvail - ovRows`. Niezmiennik anty‑overflow:
    `ovLogRows + wysokość_ekranu ≤ overlayAvail`. **Log nad ekranem to wypełniacz,
    nie wymóg**: pokazujemy go tylko gdy `ovLogRows >= 2` (1 wiersz to sam wskaźnik
    „↑ więcej" bez treści) — przy niskim oknie znika i ekran zajmuje całą wysokość
    (nakładka „nachodzi" na miejsce po ukrytym nagłówku, patrz niżej). **`overlayAvail`
    MUSI równać się REALNEJ wysokości flex‑boxa nakładki** = `termRows - HEADER`
    (root `termRows` minus nagłówek z górnym dividerem). To jedyny rosnący potomek
    roota po nagłówku, więc każda rozbieżność (np. dawne `-2`) sprawia, że za krótki
    stos `justifyContent:flex-end` ląduje niżej i zostaje pusty wiersz (gap) MIĘDZY
    nagłówkiem a logiem. Drugi warunek braku gapu: ekran musi renderować się
    dokładnie na `ovRows` wierszy — `ConflictList` rezerwuje wiersz na wskaźnik
    „↑ więcej" TYLKO przy faktycznym okienkowaniu (inaczej zwijał kartę bez potrzeby
    i ekran był niższy od budżetu → gap). Sprawdza to `action-bottom.mjs` (asercja
    `noTopGap`: tuż pod dividerem nagłówka jest treść logu, nie pusty wiersz).
  - Test: `node apps/cli/test/action-bottom.mjs` (picker+paleta, log nad, dół=ekran,
    brak overflow; obejmuje niskie okna z nagłówkiem compact/ukrytym).
- **Degradacja nagłówka przy niskim oknie + ekran „za małe" (`layout.js`)**: nagłówek
  ustępuje miejsca treści wraz ze spadkiem `termRows`. `headerLayout({termRows,
  termCols, mode})` zwraca `{ mode, height, minRows }` z czterema piętrami:
  `full` (logo, 8 / stacked 14 — tylko gdy `termRows>=16` i się mieści) → `compact`
  (1 wiersz „Liquid Flow │ ● Sklep │ Szablon │ ⚠ N", `Header` z propem `compact`,
  wraz z górnym dividerem = 2) → `none` (nagłówek **ukryty**: nakładka „nachodzi"
  na jego miejsce — terminal nie ma z‑indexu, więc po prostu go nie renderujemy,
  razem z górnym dividerem) → `guard` (okno za małe). O wariancie nagłówka decyduje
  `minBodyRows(mode)` = ile wierszy treści POD nagłówkiem dany tryb potrzebuje
  (conflicts: chrome 4 + 1 karta 3 + stopka; picker/connect/form: chrome 4 +
  1 pozycja; input: 2) — lekki ekran dostaje ładniejszy nagłówek niż conflicts
  przy tej samej wysokości.
  **Guard ma GLOBALNĄ podłogę, nie per‑tryb (`appMinRows()`)**: minimalna wysokość
  całej aplikacji = wymóg NAJCIĘŻSZEGO ekranu (conflicts z operacjami seryjnymi =
  **8**; root = `termRows`, więc bez „+1"). Poniżej tej podłogi `guard` pokazuje się
  przy KAŻDYM trybie (też w idle `input`), więc komunikat „za małe okno" nie
  wyskakuje dopiero po wejściu w cięższy ekran w środku pracy. `minRows` w wyniku
  to zawsze ta globalna podłoga (spójny komunikat). Powyżej podłogi `none` zawsze
  mieści bieżący tryb (podłoga = max need). Przy `guard` `App.jsx` renderuje
  wyśrodkowany `WindowTooSmall` (PL/EN, `{rows}` = `minRows`) zamiast rozsypanego/
  zdublowanego widoku; po `resize` znika sam (pełny re‑render). Testy:
  `apps/cli/src/layout.test.js` (logika + globalna podłoga), `Header.test.jsx`
  (wariant compact). **Nie ma już `fillHeight`** — root zawsze `height={termRows}`
  (pełna wysokość, bez dolnej linii marginesu — box nakładki sięga ostatniego
  wiersza terminala; w alt‑screenie z deferred‑wrap to bezpieczne, a brak overflow
  pilnują guard + okienkowanie), nakładki zawsze owijane (`wrapAction`).
- **Wypełnianie wysokości (input na dole)**: root dostaje `height={termRows}`,
  a obszar logu w trybie `input` ma `flexGrow={1}` + `justifyContent="flex-end"` —
  input stoi stabilnie na dole (ostatni wiersz terminala), a log rośnie w górę i
  wypełnia okno (bez sztywnego limitu; `logRows = termRows - HEADER - progress - 2`).
  **`HEADER` to teraz
  `headerLayout().height`** (nie stała) — odpowiada REALNEJ wysokości wybranego
  wariantu nagłówka: za duża → pusta linia nad logiem, za mała → przepełnienie.
  Zasadę layoutu (w tym brak pustej linii) sprawdza `node apps/cli/test/fill-height.mjs`.
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

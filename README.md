# Liquid Flow

Narzędzie do synchronizacji i **hot-reloadu** szablonów Liquid w sklepach
**Comarch e-Sklep**. Edytujesz pliki szablonu lokalnie, a Liquid Flow
natychmiast wysyła zmiany do sklepu, wykrywa konflikty z panelem
administracyjnym i (opcjonalnie) wersjonuje folder przez Git.

Dostępne w dwóch wersjach z jednym wspólnym rdzeniem:

- **Aplikacja desktopowa** (macOS / Windows / Linux) — uruchamiana z ikony,
  interfejs graficzny, ikona w pasku menu (tray), synchronizacja w tle.
- **CLI** — komenda `liquidflow` uruchamia interaktywny interfejs w terminalu
  z własnym promptem i paletą slash-komend.

## Funkcje

- **Hot-reload** — obserwuje lokalny folder szablonu; każdy zapis pliku trafia
  natychmiast do sklepu (SOAP `Liquid_FileSet` / `Liquid_FileAdd`).
- **Wykrywanie konfliktów** — gdy ktoś zmieni plik w panelu administracyjnym,
  Liquid Flow to wykryje i pozwoli **pobrać** najnowszą wersję lub **nadpisać**
  wersję w sklepie (pojedynczo lub zbiorczo).
- **Wersjonowanie i backup (Git)** — folder szablonu jako repozytorium Git:
  auto-commit po każdej synchronizacji, historia, przywracanie dowolnej wersji,
  opcjonalny push na GitHub.

## Struktura (monorepo)

```
packages/
  core/          @liquidflow/core — logika wspólna (niezależna od UI):
                   soap.js        klient SOAP iSklep24Service.asmx (+ sesja)
                   syncEngine.js  obserwator plików, hot-reload, konflikty
                   store.js       konfiguracja, metadane, ścieżki
                   git.js         wersjonowanie / backup / push
                   controller.js  orkiestracja stanu (emiter zdarzeń)
                   log.js, xml.js, translations.js
apps/
  desktop/       @liquidflow/desktop — Electron (okno, tray, IPC) + renderer
                 React + Vite + Tailwind + shadcn/ui
  cli/           @liquidflow/cli — interaktywne CLI `liquidflow` (Ink/React)
```

Obie aplikacje to dwie warstwy prezentacji nad tym samym `Controller` z
`@liquidflow/core`.

## Wymagania

- [Node.js](https://nodejs.org) 20+
- [Git](https://git-scm.com) — opcjonalnie, tylko dla wersjonowania/backupu

## Instalacja

```bash
npm install     # instaluje wszystkie workspaces (raz)
```

## Aplikacja desktopowa

```bash
npm run dev         # tryb deweloperski (Vite + Electron, hot-reload UI)

npm run build       # paczka dla bieżącego systemu
npm run build:mac   # .dmg + .zip (macOS)
npm run build:win   # instalator .exe (Windows)
npm run build:linux # .AppImage (Linux)
```

Wynik trafia do `apps/desktop/release/`. Powstaje pełnoprawna aplikacja z ikoną
(Dock / pasek zadań) oraz ikoną w tray.

**Jak używać:** dodaj sklep (nazwa, URL `https://…` lub `http://localhost:port`,
hasło webmastera — login zawsze `webmaster`) → wybierz szablon → pliki pobiorą
się lokalnie i ruszy synchronizacja na żywo. Zakładki: **Pliki** (konflikty),
**Log** (zdarzenia), **Git / Backup** (wersjonowanie).

## CLI (`liquidflow`)

```bash
npm run cli                       # uruchom z repo
# lub po zbudowaniu/zlinkowaniu pakietu:
npm link --workspace @liquidflow/cli && liquidflow
```

Uruchomienie otwiera interaktywny interfejs: górny pasek statusu (sklep,
szablon, konflikty, Git), panel logu na żywo oraz prompt. Wpisz `/`, aby
otworzyć **paletę komend** z autouzupełnianiem.

**Nawigacja:** `/` paleta · `↑`/`↓` wybór · `Enter` zatwierdź · `Tab`
autouzupełnij · `Esc` wróć · `/exit` wyjście (Ctrl+C jest celowo ignorowany,
aby nie ubić sesji synchronizacji).

**Slash-komendy:**

| Komenda | Działanie |
|---|---|
| `/connect` | połącz ze sklepem; dodaj / przełącz / rozłącz / usuń (lista sklepów + akcje) |
| `/templates` | wybierz szablon |
| `/conflicts` | konflikty i akcje — pobierz / wyślij / usuń, pojedynczo lub zbiorczo |
| `/git` | wersjonowanie i backup (auto-commit, push, historia, przywróć, remote) |
| `/open` | otwórz folder lokalny szablonu |
| `/settings` | ustawienia: zawijanie logów, język |
| `/clear` | wyczyść panel logu |
| `/exit` (`/quit`) | zakończ |

## Serwer MCP (@liquidflow/mcp)

Liquid Flow udostępnia serwer MCP (Model Context Protocol), który pozwala agentom AI (np. Claude Code, Claude Desktop) programowo sterować synchronizacją, konfliktami, logami oraz git-checkpointami za pomocą protokołu MCP.

### Jak uruchomić

Serwer działa na strumieniach stdio:

```bash
# Uruchomienie bezpośrednio z monorepo
node apps/mcp/bin/liquidflow-mcp.js

# Lub po zlinkowaniu pakietu:
npm link --workspace @liquidflow/mcp && liquidflow-mcp
```

### Konfiguracja hosta MCP

Przykładowy wpis konfiguracyjny do dodania w pliku konfiguracyjnym Twojego klienta MCP (np. claude_desktop_config.json):

```json
{
  "mcpServers": {
    "liquidflow": {
      "command": "node",
      "args": ["/bezwzględna/ścieżka/do/repo/apps/mcp/bin/liquidflow-mcp.js"]
    }
  }
}
```

### Bezpieczeństwo i ograniczenia

- **Brak haseł przez MCP**: Narzędzie connect_shop obsługuje wyłącznie połączenia z zapisanymi wcześniej sklepami posiadającymi zapamiętane hasło (SavePassword). Dodawanie nowych sklepów lub uwierzytelnianie nowych sesji musi odbywać się przez CLI lub aplikację desktopową.
- **Purity strumienia stdio**: Serwer komunikuje się wyłącznie przez stdout. Logi techniczne i błędy są przekazywane za pomocą mechanizmu błędów MCP lub kierowane na stderr.


## Gdzie są pliki

Katalog danych aplikacji (wieloplatformowy):

- **macOS**: `~/Library/Application Support/LiquidFlow/`
- **Windows**: `%APPDATA%\LiquidFlow\`
- **Linux**: `~/.config/liquid-flow/` (lub `$XDG_CONFIG_HOME`)

Struktura: `Shops/<NazwaSklepu>/files/<TemplateId>/<Mode>/…` — to tutaj
edytujesz pliki szablonu. `meta/` przechowuje znaczniki czasu do wykrywania
konfliktów, a (po włączeniu) `.git/` historię wersji.

> Wersja desktopowa i CLI dzielą ten sam katalog danych i konfigurację.

## Git — wersjonowanie szablonu (`/git`)

Repo git żyje w folderze `files/<TemplateId>/0/`. Liquid Flow utrzymuje **model
dwugałęziowy**:

- `liquidflow/wip` — gałąź robocza. Każda zmiana pliku wykryta przez watcher
  generuje automatyczny commit (auto-commit) na tej gałęzi; push **nie** jest
  wykonywany automatycznie.
- `main` — gałąź czysta. Zawiera wyłącznie commity z operacji `/git checkpoint`;
  push idzie z tej gałęzi.

### Typowy przepływ

```
/git → Włącz Git         # init repo + ustawia liquidflow/wip
# edytujesz pliki → auto-commit na wip
/git → Checkpoint        # squash wip→main, reset wip do main
/git → Push              # git push origin main
```

### Pozostałe operacje `/git`

| Operacja | Opis |
|---|---|
| **Historia / Przywróć** | wyświetla listę commitów z `main`; wybór przywraca pliki przez `git checkout` i commituje restore na `wip` |
| **Ustaw remote** | zapisuje URL zdalnego repo do konfiguracji |
| **Pull** | `git pull` z remote (dozwolony tylko gdy `wip` == `main`, tzn. brak niepchniętych commitów) |
| **Clone** | klonuje zdalne repo do folderu `0/`; nasiewa meta dla trybu `0`, pobiera pliki trybu `2` ze sklepu |
| **Auto-commit** | toggle — gdy wyłączony, watcher nie commituje (pliki nadal synchronizują się do sklepu) |
| **Auto-push** | toggle — gdy włączony, po każdym checkpoint automatycznie wykonuje push |

Gałąź `liquidflow/wip` jest zawsze tworzona z punktu startowego `main` (nie z
bieżącego HEAD), co gwarantuje czystą bazę nawet gdy HEAD jest gdzie indziej.
Wszystkie operacje git mutujące indeks (`.git/index`) są szeregowane na kolejce
sesji, aby wyeliminować wyścig o `.git/index.lock`.

## Git / GitHub — uwierzytelnianie

Push korzysta z systemowej konfiguracji Git: klucza SSH (`git@github.com:…`)
albo menedżera poświadczeń / tokenu w URL HTTPS. Liquid Flow nie przechowuje
poświadczeń GitHub.

## Protokół

SOAP `iSklep24Service.asmx`, namespace `http://www.icomarch24.pl/iSklep24`,
uwierzytelnianie `SignIn` + cookie sesji, operacje `Liquid_Get / FilesGet /
FilesMetaGet / FileSet / FileAdd / FileDelete / FileRename / FileIsValid /
Unlock`. Limity: nazwa ≤ 64 znaki, plik ≤ 519168 B, walidacja plików tekstowych.

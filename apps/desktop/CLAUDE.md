# apps/desktop — CLAUDE.md

Redesign i workflow Storybooka dla `@liquidflow/desktop` (Electron + Vite +
Tailwind + shadcn). Root `CLAUDE.md` ma architekturę ogólną (daemon, core,
i18n, testy) — ten plik dotyczy WYŁĄCZNIE tego, co żyje pod `apps/desktop`.

## Storybook (design gallery) + redesign

Redesign UI desktopu prowadzimy **bezpośrednio na `main`** (branch `redesign`
został scalony i skasowany — dawne odniesienie do pracy na osobnej gałęzi jest
nieaktualne) z użyciem **Storybooka 10 (react-vite)** jako „design gallery" —
każdy ekran renderowany w izolacji, bez Electrona i bez łączenia ze sklepem.
Stack zostaje: **Tailwind + shadcn** (retheming przez tokeny CSS w
`renderer/src/index.css`, restyle komponentów ekran po ekranie).

**Warsztat (jak działa):**
- Config: `apps/desktop/.storybook/main.js` (`viteFinal` przywraca `root` na katalog
  desktopu, dokłada alias `@` i `server.fs.allow` na root repo) + `preview.jsx`
  (import `index.css`, stub `window.api`, przełącznik **light/dark** w pasku przez
  klasę `.dark` na `<html>`).
- Mock kontekstu: `apps/desktop/renderer/src/stories/mock.jsx` — `<MockApp ctx={…}>`
  owija ekran w `AppCtx.Provider` (`AppCtx` jest eksportowany z `App.jsx`).
  Realne `t` z deep-importu czystego `@liquidflow/core/translations.js` (renderer NIE
  importuje barrela core — ciągnie moduły `node:`). Fixtures: sklepy, konflikty (3
  typy), git, log.
- Stories leżą obok komponentów jako `*.stories.jsx`; wzorzec = dekorator w
  default-exporcie owija w `<MockApp ctx={c.parameters.ctx}>`, a `parameters.ctx`
  per‑story nadpisuje fixtures.
- Uruchomienie: `npm run storybook --workspace @liquidflow/desktop` (port 6006).
  **Nowy ekran → nowy `*.stories.jsx` + ewentualny fixture w `mock.jsx`.** Weryfikacja
  wizualna w obu motywach (light + dark).

**MCP Storybooka (`liquidflow-sb-mcp`) — OBOWIĄZKOWE przy pracy nad UI desktopu.**
Addon `@storybook/addon-mcp` wystawia serwer MCP pod `http://localhost:6006/mcp`
(zarejestrowany w `.mcp.json`, scope project). **Endpoint żyje tylko gdy działa
serwer dev Storybooka** — najpierw `npm run storybook`, potem narzędzia MCP są
dostępne.

Zanim odpowiesz lub tkniesz komponent z systemu designu, **korzystaj z narzędzi MCP
`liquidflow-sb-mcp`**, żeby oprzeć się na wiedzy Storybooka o komponentach i
dokumentacji:
- **KRYTYCZNE: nie zmyślaj właściwości komponentów.** Zanim użyjesz JAKIEJKOLWIEK
  właściwości (nawet „oczywistej" jak `shadow`), sprawdź w MCP, czy jest naprawdę
  udokumentowana dla tego komponentu. Nie zakładaj propsów po nazwie ani po analogii
  do innych bibliotek — jak brak w dokumentacji, dopytaj użytkownika.
- `list-all-documentation` — lista wszystkich komponentów i wpisów dokumentacji.
- `get-documentation` — pełna dokumentacja komponentu (dostępne propsy, przykłady).
- `get-documentation-for-story` — szczegóły konkretnego wariantu/story komponentu
  (więcej przykładów użycia).
- `get-storybook-story-instructions` — aktualne instrukcje pisania/poprawiania
  stories (`*.stories.*`); pobierz je PRZED tworzeniem lub zmianą story, żeby trzymać
  bieżące konwencje.
- `preview-stories` — zwraca URL‑e podglądu stories; w odpowiedzi do użytkownika
  dołączaj te linki, żeby mógł je otworzyć.

Uwaga: ten addon (v0.6.0) **nie ma** narzędzia `run-story-tests` — nie odwołuj się do
niego. Nazwa story może nie odpowiadać nazwie propsu, więc właściwości zawsze
weryfikuj przez dokumentację/przykłady, nie przez nazwę story. Źródło:
<https://storybook.js.org/docs/ai>.

# apps/desktop — CLAUDE.md

Redesign and Storybook workflow for `@liquidflow/desktop` (Electron + Vite +
Tailwind + shadcn). The root `CLAUDE.md` has the general architecture
(daemon, core, i18n, tests) — this file covers ONLY what lives under
`apps/desktop`.

## Storybook (design gallery) + redesign

The desktop UI redesign happens **directly on `main`** (the `redesign`
branch was merged and deleted — an earlier reference to work happening on a
separate branch is outdated). It uses **Storybook 10 (react-vite)** as a
"design gallery" — every screen rendered in isolation, without Electron and
without connecting to a shop. The stack stays: **Tailwind + shadcn**
(retheming via CSS tokens in `renderer/src/index.css`, restyling components
screen by screen).

**Setup (how it works):**
- Config: `apps/desktop/.storybook/main.js` (`viteFinal` restores `root` to
  the desktop directory, adds the `@` alias and `server.fs.allow` for the
  repo root) + `preview.jsx` (imports `index.css`, stubs `window.api`, a
  **light/dark** toggle in the toolbar via a `.dark` class on `<html>`).
- Context mock: `apps/desktop/renderer/src/stories/mock.jsx` — `<MockApp
  ctx={…}>` wraps a screen in `AppCtx.Provider` (`AppCtx` is exported from
  `App.jsx`). Real `t` via a deep import of the plain
  `@liquidflow/core/translations.js` (the renderer does NOT import the core
  barrel — it pulls in `node:` modules). Fixtures: shops, conflicts (3
  types), git, log.
- Stories sit next to components as `*.stories.jsx`; the pattern = a
  decorator in the default export wraps in `<MockApp ctx={c.parameters.ctx}>`,
  and `parameters.ctx` per-story overrides fixtures.
- Run it: `npm run storybook --workspace @liquidflow/desktop` (port 6006).
  **New screen → new `*.stories.jsx` + an optional fixture in `mock.jsx`.**
  Visually verify in both themes (light + dark).

**Storybook MCP (`liquidflow-sb-mcp`) — MANDATORY when working on the
desktop UI.** The `@storybook/addon-mcp` addon exposes an MCP server at
`http://localhost:6006/mcp` (registered in `.mcp.json`, project scope). **The
endpoint only lives while Storybook's dev server is running** — run `npm
run storybook` first, then the MCP tools become available.

Before answering or touching a component from the design system, **use the
`liquidflow-sb-mcp` MCP tools** to ground yourself in Storybook's knowledge
of the components and their docs:
- **CRITICAL: never make up component props.** Before using ANY prop (even
  an "obvious" one like `shadow`), check in the MCP whether it's actually
  documented for that component. Don't assume props by name or by analogy
  to other libraries — if it's missing from the docs, ask the user.
- `list-all-documentation` — list of all components and doc entries.
- `get-documentation` — full component docs (available props, examples).
- `get-documentation-for-story` — details for a specific component
  variant/story (more usage examples).
- `get-storybook-story-instructions` — current instructions for
  writing/fixing stories (`*.stories.*`); fetch these BEFORE creating or
  changing a story to follow current conventions.
- `preview-stories` — returns preview URLs for stories; include these links
  in your response to the user so they can open them.

Note: this addon (v0.6.0) does **not** have a `run-story-tests` tool — don't
refer to it. A story's name may not match a prop's name, so always verify
props via docs/examples, not the story name. Source:
<https://storybook.js.org/docs/ai>.

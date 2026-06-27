# Plan 002: Fix the README so it documents the CLI that actually ships

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report — do not improvise. When done, update
> this plan's status row in `plans/README.md` unless a reviewer told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat e1599ef..HEAD -- README.md apps/cli/src/commands.js apps/cli/src/index.jsx`
> If `README.md` or the CLI command set changed since this plan was written,
> re-derive the live command list (Step 1) before editing; on a mismatch with
> the excerpts below, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `e1599ef`, 2026-06-27

## Why this matters

The README's CLI documentation is for a previous version of the tool. It lists
ten slash commands that **no longer exist** (`/help`, `/login`, `/shops`,
`/files`, `/download-all`, `/upload-all`, `/refresh`, `/lang`, `/status`,
`/remove`); the CLI now ships eight entirely different commands. It also tells
users `Ctrl+C` quits — but the CLI **deliberately ignores Ctrl+C** so an
accidental keypress can't kill a live sync session (exit is only via `/exit`).
And it states Node 18+ while `package.json` requires `>=20`. A new user
following this README types commands that do nothing and gets the exit behavior
wrong. This is documentation that is actively wrong, which is worse than absent.

## Current state

The wrong content is entirely inside `README.md`. The **source of truth** for
the real commands is `apps/cli/src/commands.js:288-297`:

```js
  const commands = [
    { name: '/connect', desc: t.CmdConnect, run: () => connect() },
    { name: '/templates', desc: t.CmdTemplates, run: () => goTemplates() },
    { name: '/conflicts', desc: t.CmdConflicts, run: () => showConflicts() },
    { name: '/git', desc: t.CmdGit, run: () => gitMenu() },
    { name: '/open', desc: t.CmdOpen, run: () => { … } },
    { name: '/clear', desc: t.CmdClear, run: () => clearLog() },
    { name: '/settings', desc: t.CmdSettings, run: () => settingsMenu() },
    { name: '/exit(quit)', desc: t.CmdExit, run: () => exit() },
  ];
```

The Ctrl+C behavior is fixed in `apps/cli/src/index.jsx:33-40` (SIGINT is a
no-op; `render(..., { exitOnCtrlC: false })`). The Node floor is in
`package.json` (`"engines": { "node": ">=20" }`).

The wrong README lines:

- `README.md:48` — `- [Node.js](https://nodejs.org) 18+` (should be 20+).
- `README.md:88-89` — navigation line ending `· \`Ctrl+C\` wyjście.`
- `README.md:91-107` — the entire slash-command table (10 stale rows).

The README is written in **Polish** — keep it Polish and match the existing
tone/formatting (Markdown table, backtick-wrapped command names).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| List real commands | `grep -oE "name: '/[a-z()]+'" apps/cli/src/commands.js` | the 8 names above |
| Check no stale refs remain | `grep -nE '/(help\|login\|shops\|files\|download-all\|upload-all\|refresh\|lang\|status\|remove)\b' README.md` | no output (exit 1) |
| Tests | `npm test` | exit 0 (unchanged — sanity only) |

## Scope

**In scope** (the only file you should modify):

- `README.md`

**Out of scope** (do NOT touch):

- `apps/cli/src/commands.js` and any source — this is a docs-only change; the
  code is the source of truth and is already correct.
- The Polish/English wording in `translations.js` — README is hand-written
  prose, not pulled from the i18n table.

## Git workflow

- Branch: `advisor/002-readme-cli-accuracy`
- Conventional Commits in English, e.g. `docs: align README CLI commands with shipped CLI`.
- **No `Co-Authored-By` footer** (repo convention in `CLAUDE.md`).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Confirm the live command set

**Verify**: `grep -oE "name: '/[a-z()]+'" apps/cli/src/commands.js` →
`/connect`, `/templates`, `/conflicts`, `/git`, `/open`, `/clear`,
`/settings`, `/exit(quit)`. If this list differs from the table you are about
to write, use the live list (it is authoritative) and note the difference in
your report.

### Step 2: Replace the slash-command table (`README.md:91-107`)

Replace the stale table (the `| Komenda | Działanie |` block and all its rows,
including the `/help`…`/quit` rows) with:

```markdown
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
```

(The old separate bulk commands `/download-all` / `/upload-all` / `/refresh`
are intentionally gone — bulk download/upload now live in the `/conflicts`
footer, and conflicts are recomputed automatically in the background, so there
is no `/refresh`. Do not re-list them.)

### Step 3: Fix the navigation line (`README.md:88-89`)

Replace the `**Nawigacja:**` line so it does not claim Ctrl+C exits:

```markdown
**Nawigacja:** `/` paleta · `↑`/`↓` wybór · `Enter` zatwierdź · `Tab`
autouzupełnij · `Esc` wróć · `/exit` wyjście (Ctrl+C jest celowo ignorowany,
aby nie ubić sesji synchronizacji).
```

### Step 4: Fix the Node version (`README.md:48`)

Change `- [Node.js](https://nodejs.org) 18+` to `- [Node.js](https://nodejs.org) 20+`.

### Step 5: Verify no stale references survive

**Verify**: `grep -nE '/(help|login|shops|files|download-all|upload-all|refresh|lang|status|remove)\b' README.md`
→ **no output** (the removed command names are gone). If any line still matches,
it is a leftover reference — fix it (or, if it is legitimate prose unrelated to
a command, leave it and note it in your report).

**Verify**: `grep -n 'Ctrl+C' README.md` → the only match is the new navigation
line that says Ctrl+C is ignored (no line claims it quits).

**Verify**: `npm test` → exit 0 (this change touches no code; confirms you
didn't accidentally edit a source file).

## Test plan

No automated tests cover README prose. Verification is the grep gates in Step 5
plus a manual read-through: the command table matches `commands.js`, the exit
instruction matches `index.jsx`, and the Node version matches `package.json`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -nE '/(help|login|shops|files|download-all|upload-all|refresh|lang|status|remove)\b' README.md` returns no output.
- [ ] `grep -c '`/connect`' README.md` ≥ 1, and the table contains all 8 live command names.
- [ ] No line in README claims `Ctrl+C` quits; the Node requirement reads `20+`.
- [ ] `git status` shows only `README.md` modified.
- [ ] `npm test` exits 0.
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report back if:

- Step 1's live command list differs from the table in Step 2 (the CLI changed
  since this plan was written) — write the live list and report the delta.
- `README.md` has been restructured so the line numbers / blocks in "Current
  state" no longer locate the stale content.

## Maintenance notes

- This README section drifts whenever `commands.js` changes. Consider (future,
  out of scope here) generating the command table from `buildCommands` or adding
  a tiny test that asserts every `name` in `commands.js` appears in `README.md`,
  so the two can't silently diverge again.
- Reviewer: skim the rendered Markdown table for column alignment and confirm
  the `/connect` description reflects that it absorbed the old `/login`,
  `/shops`, `/logout`, and `/remove` flows.

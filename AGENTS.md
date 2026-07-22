# AGENTS.md

Onboarding contract for AI agents (and humans acting like one) working in this repo.

## What HubHole is

A HubSpot-flavored [hole.io](https://hole-io.com/) game built with HTML5 Canvas. Swallow records, deals, tickets and workflows across 10 Hubs. See [`README.md`](README.md) for gameplay, controls, and setup.

## Architecture in one sentence

The entire game (markup, styles, and script) lives in a single `index.html` file — no framework, no bundler, no transpilation. `scripts/` holds small dependency-free Node tools (serve, build, test, art-generation CLI). There is no backend and no persistence (no database, no `localStorage`).

## Why editing `index.html` needs care

- It's the whole game. Level data (`LEVELS`), comedy content, audio synthesis, rendering, and all game systems (combo, rivals, sync storms, achievements) live in one `<script>` block. A typo anywhere can break the whole thing, and there's no compiler to catch it early — `npm test` is the safety net, not a linter.
- The headless test suite (`scripts/logic-test.js`) extracts the script body from `index.html` with a regex expecting exactly one `<script>...</script>` tag. Don't split the script into multiple tags.
- Canvas rendering relies on sprite caching (`spriteCache`, `bgSpriteCache`) for performance. Anything drawn every frame should follow that pattern rather than redrawing raw text/paths.
- There's no framework diffing to protect you from state bugs — game state is plain module-level variables, rebuilt per level by `buildLevel()`.

## Run / test

```bash
npm install
npm start                    # serves at http://localhost:3003
npm test                     # 40-check headless logic suite
npm run build                # copies index.html + assets/ into dist/
```

Dev shortcut: append `?autostart=N` to the URL to jump straight into level `N` (1-based), skipping the start/intro screens:

```
http://localhost:3003?autostart=3
```

## Hard rules

- **Never commit `.leonardo-key`.** It's gitignored. The Leonardo AI API key comes only from the `LEONARDO_API_KEY` env var or that gitignored file — never hardcode it anywhere, including scripts or commit messages.
- **Run `npm test` before committing** any change to `index.html`. All 40 checks must pass.
- **There is no build step to break** — `npm run build` only copies files, so if it fails the problem is a missing file, not a compile error. Still run it before pushing, alongside `npm test`.
- **Static-only.** Don't introduce a backend, database, or server-side dependency. This is a client-only static site.

## Deeper context

For architecture, conventions, module breakdowns, ADRs, and a deploy runbook, see `.wiki/INDEX.md` — a local-only wiki (not part of this public repo; it lives in the working copy but is gitignored/never committed). If you don't have local access to it, this file and [`STATUS.md`](STATUS.md) are the public-facing summary.

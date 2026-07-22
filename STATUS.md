# STATUS.md

_Last updated: 2026-07-22._

## Built and working

- **10 playable levels** (Hubs), each with its own item taxonomy, target mass, timer, and world size — CRM Basics through Breeze AI (the finale).
- **11 achievements**, from *First Contact... Consumed* to *Platform Apocalypse*.
- **40-check headless test suite** (`npm test` / `scripts/logic-test.js`) covering data integrity, a full 10-level playthrough, the fail path, golden records, combos, sync storms, rival-eating, easter eggs, and a render smoke test. Passing as of this commit.
- **Core systems**: combo multiplier (up to 5x, 6 named tiers), golden records (8x jackpots), sync storms (scripted weather events), edible rival holes (levels 6–10, up to 2 simultaneous), fake CRM notifications, per-object comedy quips, Konami-code god mode, and two typed-word easter eggs (`unsub`, `breeze`).
- **AI-generated art assets** (`assets/`): start-screen hero backdrop + motion loop, logo emblem/favicon, win-screen trophy art + motion loop, 10 hub icons, golden-record/rival-emblem sprites, fail art — all produced via the Leonardo AI pipeline (`scripts/leonardo.js`, `scripts/gen-assets.sh`).
- **Synthesized audio** — all sound (gulps, chimes, fanfares, background bass groove) generated live via the Web Audio API. No audio files.
- **Tooling**: `npm start` (local static server, port 3003), `npm run build` (copies `index.html` + `assets/` to `dist/`), `npm test`.

## In-flight / proposed (not built)

The following is pulled from `docs/redesign.md`, a design proposal, **not shipped work**. None of it exists in `index.html` today unless noted otherwise.

- **PROPOSED — Stack-based spawning & vacuum mechanics** (Phase 1 of the redesign): replacing today's uniform random object scatter with clustered "stacks," an attract/vacuum radius, staggered multi-eat cascades, and a rising-pitch gulp ladder.
- **PROPOSED — Persistence & meta-progression** (Phase 2): a `localStorage` save system, coins, upgrade tracks (size/speed/magnet), a level-select map, a collection album ("Hoard-o-pedia"), per-level challenges, and stars/completion tracking. **Confirmed: there is currently zero persistence in the shipped game** — all state resets every session.
- **PROPOSED — Theme expansion & bosses** (Phase 3): a possible retheme from the CRM/Hub concept to an "Archipelago" (island-hopping) theme, per-world boss fights, hazards, and cosmetic skins. Explicitly the most speculative phase; not committed to.

See `docs/redesign.md` for full detail and `docs/genre-research.md` for the research it's based on. None of this roadmap has been started in code as of this commit.

## Known gaps

- No persistence (see above) — achievements, mass, and best combo all reset on reload.
- No CI — `npm test` and `npm run build` are run manually by whoever is pushing; there is no automated pipeline yet.
- No analytics or telemetry (by design — this is a static client-only game).

## Repo / publishing status

- Public GitHub repo: `https://github.com/NicoLafakis/hubhole` (package name `hubhole`; the local working-copy folder is separately named).
- Version-controlled since 2026-07-22 (`git init -b main`, initial commit `97c9024`).
- Tracked: `index.html`, `package.json`, `package-lock.json`, `README.md`, `scripts/`, `docs/`, `assets/`, plus this file and `AGENTS.md`.
- Gitignored: `.leonardo-key`, `node_modules/`, `dist/`, `.DS_Store`, `Thumbs.db`, `*.log`.
- Not deployed to a live URL yet — see `.wiki/runbooks/deploy.md` (local-only wiki) for the deploy options (Vercel/Netlify/GitHub Pages).

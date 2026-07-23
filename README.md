# 🌀 Flywheel

A HubSpot-flavored eat-'em-up game (in the spirit of [hole.io](https://hole-io.com/)) built with Three.js.

A rogue flywheel just started spinning inside the HubSpot platform. Swallow every record, deal, ticket and workflow across **10 Hubs** — grow big enough to eat the whole CRM.

> Not affiliated with HubSpot, Inc. · All records were harmed.

## Play

Open `index.html` in any modern browser, or run locally:

```bash
npm install
npm start
```

Then visit [http://localhost:3003](http://localhost:3003).

## Controls

- **Mouse / touch drag** — move the flywheel
- **WASD** or **Arrow keys** — move the flywheel
- **M** — mute / unmute
- **Goal** — eat objects smaller than your rim to gain mass
- **Win condition** — reach the target mass before the timer runs out

## The Good Stuff

- **🎨 AI-generated art** — start-screen hero backdrop, logo emblem (also the favicon) and win-screen trophy art, generated with Leonardo AI (`assets/`). Regenerate any time:
  ```bash
  # needs LEONARDO_API_KEY env var or a .leonardo-key file (gitignored)
  node scripts/leonardo.js models          # list available models
  node scripts/leonardo.js gen "prompt" 1344 768 assets/hero-vortex.png
  ```
- **🌀 Animated flywheel vortex** — spiral arms, pulsing depth ring, fake-glow rim. Objects spaghettify as they fall in.
- **⚡ Juice, optimized** — shockwaves, particles, parallax hub backgrounds and vignette, all sprite-cached so it runs smooth.
- **🔥 Combo system** — chain eats to multiply mass (up to ×5). Tiers escalate from `SNACKING` to `THE SYNC-ENING`.
- **⭐ Golden records** — 1–2 jackpots per level, worth 8×. The one clean contact in the entire CRM.
- **⚡ Sync storms** — objects periodically rain from the sky. Delicious weather.
- **🌀 Edible rivals** — out-grow a rival flywheel, then swallow it for a massive bonus. There can be only one.
- **🏆 11 achievements** — from *First Contact... Consumed* to *Platform Apocalypse*.
- **💬 Comedy everywhere** — every object type has its own quips, plus fake CRM notifications, sassy level intros/outros, and growing titles from *Data Gremlin* to *CRM Singularity*.
- **🎵 Synthesized audio** — gulps, chimes, fanfares and a quiet bass groove. No audio files, all Web Audio API.

## Easter Eggs

- **Konami code** (`↑ ↑ ↓ ↓ ← → ← → B A`) during play — god mode, +500 mass.
- **Type `unsub`** during play — unsubscribe from physics.
- **Type `breeze`** during play — summon fresh AI agents. To eat.

## Levels

| # | Hub | Twist |
|---|-----|-------|
| 1 | CRM Basics | Learn the ropes with contacts, companies and lists |
| 2 | Marketing Hub | Emails, forms, CTAs and heavy campaigns |
| 3 | Sales Hub | Deals, quotes and closed-won trophies |
| 4 | Service Hub | Tickets, knowledge base and happy customers |
| 5 | Content Hub | Blogs, videos, podcasts and ebooks |
| 6 | Operations Hub | **Rival flywheel** appears — don't let it steal your workflows |
| 7 | Commerce Hub | **Rival flywheel** — protect invoices, carts and payments |
| 8 | Reporting & Analytics | **Rival flywheel** — swallow dashboards and charts |
| 9 | App Marketplace & Automation | **Two rival flywheels** compete for integrations |
| 10 | Breeze AI | The finale — eat the entire platform including AI agents |

## Docs

Design and research documentation lives in `docs/`:

- [`docs/genre-research.md`](docs/genre-research.md) — synthesized research on the eat-and-grow genre (hole.io, Attack Hole, All in Hole, hoard-and-stack games), with sources.
- [`docs/redesign.md`](docs/redesign.md) — the redesign & expansion proposal: thematic directions, stack mechanics, meta-progression, juice list, and a phased implementation roadmap.

## Dev / Test Hook

Jump straight into a level for testing by adding `?autostart=N` to the URL, where `N` is the 1-based level number:

```
http://localhost:3003?autostart=3
```

Run the headless logic test suite (40 checks: data integrity, full 10-level playthrough, fail path, golden records, combos, storms, rival-eating, easter eggs, render smoke test):

```bash
npm test
```

## Deploy

This is a static single-page app. Deploy `index.html` to any static host:

- **Vercel**: `npx vercel --prod`
- **Netlify**: drag the project folder into Netlify Drop
- **GitHub Pages**: enable Pages on the repo root

Or build a `dist/` folder:

```bash
npm run build
```

## License

MIT

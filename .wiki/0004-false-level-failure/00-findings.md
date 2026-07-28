# 0004 - "I was over the target mass and still failed": findings

**Date:** 2026-07-27
**Source of report:** game owner, playing the live build
**HEAD investigated:** `330f569`
**Severity:** high (the loss is legitimate, the game's own copy tells the
player it was not, which reads as a broken win check)
**Status:** FIXED (2026-07-27) in commit `9c1f460`. §7 is the
original fix outline and §9 the build sheet; both were written before any code
existed and are kept verbatim as the record of what was specified. What was
actually built, and the two deviations from the sheet, are in §10 at the
bottom — read that, not the "NOT IMPLEMENTED" banners inside §9.

## 1. Symptom

Verbatim: *"I got over the required amount of mass, but still failed
somehow."*

Precise characterization: on a level from L10 upward, the player's mass
reached or exceeded `level.target`, the mass bar sat visually full, the
timer expired, and the run resolved as a LOSS. The fail screen then rendered
a sentence asserting the opposite of what happened: `Time ran out at
126,069 / 100,000 mass.` A number over the target, presented as the reason
for the loss.

## 2. Root cause (confidence: confirmed for the mechanism, high that it is
what the owner hit)

**Category (c) with a copy defect on top: correct win logic, a second win
condition that the UI states once and then never again, and a fail screen
that actively misattributes the loss to the condition the player DID meet.**

From L10 on, every level requires two things, not one: `mass >= target`
**and** the district landmark (the capstone) swallowed. The check is
`src/main.js:1926-1931` (and its timer-expiry twin at
`src/main.js:1396-1401`):

```js
const massReached = avatar.mass >= level.target;
const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;
if (massReached && (!capstoneRequired || state.capstoneEaten)) {
```

`DEFAULT_SIZE_GATE` is 0.78 (`src/systems/swallow.js:52`) and
`capstoneGate(n)` (`src/data/formulas.js:78-81`) returns 0.78 for L1-L20's
tiers, then 0.80 / 0.85 / 0.92 / 0.95. Combined with `|| level.isCapstone`
(every 10th level), the landmark is mandatory on L10 and on **every level
from L11 to L100**. That is 91 of 100 levels where hitting the mass number
alone is a loss by design.

The player is told this exactly once, in the pre-level intro paragraph
(`src/main.js:925-931`, the line "Grow big enough to swallow the district's
landmark to finish"). After the level starts there is no surface that
repeats it: the HUD is `Mass <b>X</b> / Y` plus a fill bar and nothing else
(`src/ui/overlays.js:239-254`), the minimap draws the landmark as a plain
icon with no requirement or edibility state (`src/ui/minimap.js:126-133`),
and the bar clamps at 100% (`overlays.js:253`) so it reads "done" for the
entire remainder of the run.

Then the loss is explained wrongly. `src/main.js:1190-1194` is
unconditional:

```js
descEl.innerHTML = `Time ran out at <b>${Math.floor(avatar.mass).toLocaleString()}</b> / ${level.target.toLocaleString()} mass.`
```

When the loss was caused by the uneaten landmark, that sentence prints a
mass at or above target and names the mass target as the thing that ran out.
That single line is why this reads as a bug rather than as a lost race: the
game asserted the player met the only condition it ever showed them, and
still failed them.

## 3. Causal chain

- **Trigger:** the player crossed `level.target` on a level with
  `capstoneRequired === true` without having eaten the landmark, and the
  timer then expired (`src/main.js:1393-1402`).
- **Proximate cause:** `state.capstoneEaten` was `false`, so the win
  conjunction at `src/main.js:1928` was false and `levelFail()` ran.
- **Root cause (design/communication, not logic):** the capstone condition
  is a first-class win requirement introduced in the V2 build
  (`e808857`, which authored both `capstoneRequired` at `src/main.js` and its
  single intro-screen mention), but it was only ever wired into the *pre-game*
  copy. No in-play HUD affordance and no fail-screen branch were built for
  it, so the mass readout became a de-facto progress-to-win meter that is
  wrong for 91 of 100 levels.
- **Contributing factor A:** the mass bar clamps to 100%
  (`src/ui/overlays.js:253`) and stays there, reinforcing "you have won" for
  minutes.
- **Contributing factor B:** on L41-L50 the mass target is provably NOT
  sufficient even in principle, see §4.3. The landmark's size gate does not
  open until ~101.6% of target.
- **Contributing factor C (display, minor):** the compact HUD formatter
  added in the same commit as this report's build (`330f569`,
  `src/ui/format.js`) can render a sub-target mass identically to the target,
  see §4.4. Bounded at 0.09%, and the fail screen prints exact figures, so
  this is not what the owner saw.

## 4. Evidence

All of it reproduces from the repo with no browser, no dev server and no
network. Probes live in `evidence/` beside this doc; run them from that
directory.

### 4.1 The landmark is mandatory on 91 of 100 levels

`node .wiki/0004-false-level-failure/evidence/capstone-gate-probe.mjs`
prints, per level, `capstoneRequired`. It is `false` only for L1-L9.

### 4.2 The game is genuinely winnable, so this is not an impossible-level bug

`node scripts/invariant-test.js` passes 9/9 invariants over 100/100 levels
at HEAD, including invariant 4 ("capstone edible radius reachable by 90% of
timer") and invariant 5 ("every level completable by the bot without
upgrades"). Hypothesis "the landmark can never become edible" is
**falsified**.

Caution for the next investigator: `node scripts/soak-bot.js <n>` run
standalone reports `completed=false` with `finalMass` far over target on
every capstone level. That is a harness artefact, not a game finding. The
CLI branch passes a placeholder `landmarkRadius: 100`
(`scripts/soak-bot.js:404`), larger than any real landmark (max is
mega-spire at 73.6u), so the size gate never opens in that mode.
`scripts/invariant-test.js:32-48` passes the real per-metro bounding radii.
Trust the invariant suite, not the bare CLI.

### 4.3 On L41-L50 the mass target alone cannot open the landmark gate

Edibility is `obj.radius > r * gateFraction` (`src/systems/swallow.js:123-126`,
mirrored for tinting at `src/main.js:1732-1733`). The landmark's effective
radius is `max(geometry bounding radius, capstoneGateRadius(level))`
(`src/main.js:619`), and `capstoneGateRadius` is
`radiusFromMass(0.7 * baseTarget) * capstoneGate`
(`src/data/formulas.js:251-254`).

Measured bounding radii (probe output): onion-palace 24.2, clock-tower 29.8,
liberty-statue 33.8, lattice-tower 43.6, sail-opera 49.6, sky-tower 50.8,
amphitheater 51.0, mountain-statue 56.2, portal-tower 64.4, **mega-spire
73.6**.

For mega-spire (L41-L50, tier gate 0.85) the geometry branch wins:
required avatar radius = 73.6 / 0.85 = 86.6u, which by
`radiusFromMass` (`formulas.js:210-212`) needs base mass 1016 against a base
target of 1000. So the level cannot be won until the player is at **101.6%
of the displayed target**. Every other metro opens the gate at 70% of target
as designed. This is a real balance defect, independent of the copy defect:
the number the HUD shows as the goal is not a sufficient goal on ten levels.

### 4.4 The compact formatter can read as "target reached" while short

`evidence/capstone-timing-probe.mjs` computes, per level, the lowest mass
whose `formatCompact` string equals the target's. Worst case is 0.09%
(L75: 5,620,000 displays as "5.62M", same as the 5,625,000 target). L41 is
0.06%. Most levels are 0.00% because `target(n) = 1000n^2` often lands on a
bucket boundary. Since `formatCompact` truncates
(`src/ui/format.js:42-47`) it can only ever under-report, and the fail
screen prints exact `toLocaleString()` figures, a player who lost this way
would have SEEN a sub-target number. Hypothesis (b), a pure rounding
artefact, is therefore **falsified as the cause of the report**, though the
0.09% collision is worth closing while the fix is open.

### 4.5 Nothing reduces avatar mass

Every write to `avatar.mass` is an increase or a level-start reset
(`src/main.js:981, 1296, 1684, 1865`). Hypothesis "a rival stole mass back
below target after the bar filled" is **falsified**.

### 4.6 How long a player can sit above target with the level unwon

From `evidence/capstone-timing-probe.mjs` (real landmark radii), the gap
between the landmark becoming edible and the greedy bot actually finishing
runs 2.4s to 31.6s (L100: edible at 32.6s, won at 64.2s). A human who does
not know the landmark is required simply never closes that gap and plays out
the rest of the timer above target.

## 5. Blast radius and siblings

- 91 of 100 levels carry the unstated second condition.
- L41-L50 additionally require ~1.6% over target before the level is
  winnable at all (§4.3).
- Two more paths make the landmark inedible for a stretch while the mass bar
  reads full, with the same silent-failure shape:
  - **Landmark shield, L61+**: `capstoneGate` is forced to 0 until 10
    non-capstone eats crack it (`src/main.js:628`, `1665-1674`;
    `src/data/levels.js:124,143`). There is a banner when it breaks, none
    while it holds.
  - **Portal protocol twist, L100**: the gate is 0 until peak combo reaches
    25 (`src/main.js:1050-1055`, `1476-1486`; `src/data/metros.js:269-272`).
    A player who never chains 25 eats cannot win at any mass.
- Same-shape copy defect: the fail screen is the only loss explanation and
  it has exactly one branch (`src/main.js:1190-1194`).
- The done screen (`src/main.js:1165`) does not have this problem.

## 6. Verdict

**(c)**, with a genuine copy bug and a genuine balance bug attached. The win
check at `src/main.js:1926-1931` is correct as written. The player really
did lose. The defects are: the second condition is invisible during play,
the fail screen misstates the reason, and on L41-L50 the advertised target
is not actually a sufficient target.

## 7. Fix specification

Scoped to the smallest set that makes the loss legible. Ordered by value.

**7.1 Branch the fail copy (`src/main.js:1190-1194`).** Compute
`capstoneRequired` and `state.capstoneEaten` in `levelFail()` exactly as
`updatePlay` does, then choose the sentence:

- mass short, capstone irrelevant or eaten: keep today's line.
- mass reached, capstone missing: "Time ran out with the landmark still
  standing. You had X mass (target Y), but the district's landmark has to go
  down too."
- both short: mention both.

This alone converts the reported bug into a fair loss.

**7.2 Show the landmark requirement in the HUD while playing.** Add a small
capstone chip next to the mass readout in `src/ui/overlays.js` `updateHUD`
(the function already receives level state at `src/main.js:2011-2020`; pass
`capstoneRequired`, `capstoneEaten`, `capstoneEdible` and, for L61+, the
remaining shield count). Three states: locked ("landmark: grow more"), edible
("landmark: EAT IT", the moment `obj.radius <= r * gate` first holds), eaten
(checked). Drive `capstoneEdible` off the same comparison the edibility pass
already runs at `src/main.js:1732-1733` so there is one source of truth.
Fire a one-off banner plus a sound the first frame it turns edible, which is
the "grow to eat THAT" beat the design doc already asks for.

**7.3 Do not let the mass bar read as "won" when it is not.** In
`src/ui/overlays.js:251-254`, when the capstone is required and not yet
eaten, cap the visual fill below full (or add a distinct final segment for
the capstone) so a full bar always means a won level.

**7.4 Fix the L41-L50 gate (balance).** The geometry branch of
`src/main.js:619` overshoots the economy model on mega-spire only. Preferred
fix: scale the landmark mesh down to the economy-derived radius rather than
taking `max()` of the two, so the size gate is always the economy value
(70% of target) at every metro. Alternative if the mesh must keep its size:
raise `capstoneGate` for the expert tier, or lower
`CAPSTONE_EDIBLE_MASS_FRACTION`, until `needBase <= 1000` at every metro.
Either way, re-run `scripts/invariant-test.js`.

**7.5 Close the formatter collision (`src/ui/format.js`).** When a value is
short of a reference target, it must not render identically to it. Simplest:
have the HUD render the mass with one more significant figure when
`mass/target > 0.99`, or render "99.9%" style progress in that band.

**Regression tests to add with the fix:**

- Logic suite (`scripts/logic-test.js`): a case asserting that for every
  level, the mass at which the capstone size gate opens is `<= target`.
  This would have caught §4.3 at authoring time. The existing invariant 4
  only checks reachability in TIME, not that the gate opens at or under the
  advertised mass.
- Logic suite: fail-reason selection is a pure function of
  `(mass, target, capstoneRequired, capstoneEaten)`. Extract it from
  `levelFail()` and assert all four quadrants, in particular that
  `mass >= target && !capstoneEaten` never yields the "ran out of mass"
  string.
- Logic suite: `formatCompact(m) !== formatCompact(t)` for any `m < t`
  within 1% of `t`, at every level's target.

## 8. Prevention

The class of bug is "a win condition exists in the rules that does not exist
on any always-on surface." Two cheap structural guards:

1. **One place defines the win, and the HUD renders from that same place.**
   Today the conjunction is written out twice (`src/main.js:1397` and
   `1928`) and the HUD renders from neither. Extract a
   `evaluateWin(state, level)` returning `{ won, massMet, capstoneMet,
   blockingReason }`, and have the timer branch, the per-frame branch, the
   HUD chip and the fail copy all consume it. Any future third condition
   then appears in the UI and in the loss explanation for free.
2. **Every loss must name its own cause.** Make the fail screen render
   `blockingReason` rather than an authored sentence. A hard-coded
   explanation of a loss is a lie waiting for the rules to change under it,
   which is exactly what happened here.

## 9. Implementation-ready specification (nothing here is implemented)

Added 2026-07-27 at the team lead's request for an executable handoff. This
section is a build sheet, not a record of work done. **Status of every item
below: SPECIFIED, NOT IMPLEMENTED.** No file under `src/` was modified by
this investigation.

Line numbers are against a working tree that other agents are editing
concurrently (`src/main.js` shifted by ~115 lines during this
investigation), so anchor on the quoted code, not on the number.

### 9.0 Ownership and concurrency

Files this work touches: `src/main.js` (win/fail/HUD logic only),
`src/ui/overlays.js`, `src/ui/format.js`, `index.html` (one HUD span plus
its CSS), `scripts/logic-test.js`. Item 9.4 also touches the landmark spawn
in `src/main.js`, which the geometry pass may be holding: coordinate before
editing that one line.

### 9.6 Do this first: `evaluateWin(state, level)`

Everything else consumes it, so build it first even though the fail copy is
the higher-value user-facing fix. Place it next to the other pure helpers
near the top of `src/main.js` (or, better, in a new `src/systems/win.js` so
the logic suite can import it without pulling in THREE).

```js
// The level's win rule, in ONE place. Every surface that talks about
// winning or losing reads this: the timer-expiry branch, the per-frame
// branch, the HUD capstone chip and the fail-screen copy. A win condition
// that is not visible in the UI is how 0004 happened.
export function evaluateWin(runState, level) {
  const massMet = runState.mass >= level.target;
  const capstoneRequired = level.capstoneGate > DEFAULT_SIZE_GATE || level.isCapstone;
  const capstoneMet = !capstoneRequired || runState.capstoneEaten;

  // Why the capstone is not yet takeable, most specific reason first.
  let capstoneBlocker = null;          // null | 'shield' | 'combo' | 'size'
  if (capstoneRequired && !runState.capstoneEaten) {
    if (runState.shieldRemaining > 0) capstoneBlocker = 'shield';
    else if (runState.portalComboNeeded > 0
      && runState.peakCombo < runState.portalComboNeeded) capstoneBlocker = 'combo';
    else if (!runState.capstoneEdible) capstoneBlocker = 'size';
  }

  return {
    won: massMet && capstoneMet,
    massMet,
    capstoneRequired,
    capstoneMet,
    capstoneBlocker,
    // For the fail copy: what actually stopped this run.
    blockingReason: massMet && capstoneMet ? null
      : (!massMet && !capstoneMet ? 'both' : (!massMet ? 'mass' : 'capstone')),
  };
}
```

`runState` is a plain object assembled from `state` and `avatar`, so the
function stays pure and Node-testable:
`{ mass: avatar.mass, capstoneEaten, capstoneEdible, shieldRemaining,
peakCombo, portalComboNeeded }`.

`capstoneEdible` must be written from the SAME comparison the edibility
pass already runs (`obj.radius > r * gateFraction`, `src/main.js:1732-1733`
region, `src/systems/swallow.js:123-126`). Set `state.capstoneEdible` in
that loop when the capstone prop is visited; do not recompute it, or the
chip and the swallow will disagree at the boundary.

`portalComboNeeded` comes from the twist params
(`src/data/metros.js:269-272`, `requiresComboCount`, default 25), set to 0
when the twist is not active.

Then replace both call sites with the helper:

- the timer-expiry branch (currently `src/main.js:1512-1517`)
- the per-frame branch (currently `src/main.js:2042-2048`)

both becoming `const win = evaluateWin(runStateOf(), level); if (win.won)
levelDone(); else levelFail(win);`.

### 9.1 Fail copy (highest priority)

Replace the unconditional sentence (currently `src/main.js:1308`). Take the
evaluation as an argument so the copy cannot drift from the rule:

```js
function levelFail(win) {
  // ...existing body...
  const massText = `<b>${Math.floor(avatar.mass).toLocaleString()}</b> / ${level.target.toLocaleString()} mass`;
  let why;
  if (win.blockingReason === 'mass') {
    why = `Time ran out at ${massText}.`;
  } else if (win.blockingReason === 'capstone') {
    // The 0004 case: mass was MET. Never blame the number the player hit.
    why = `You hit the mass target (${massText}), but the district landmark is still standing.`
      + (win.capstoneBlocker === 'shield'
        ? ` Its shield held: ${state.shieldRemaining} more eats would have cracked it.`
        : win.capstoneBlocker === 'combo'
          ? ` The Portal never opened: it needs a peak combo of ${state.portalComboNeeded} (best this run: ${state.peakCombo}).`
          : ' You needed to grow bigger before it could go down.');
  } else {
    why = `Time ran out at ${massText}, with the district landmark still standing.`;
  }
```

Acceptance: on a capstone loss the string must not contain the phrase "Time
ran out at X / Y mass" with X >= Y. That is the exact sentence the owner
reported.

### 9.2 Landmark HUD chip

Markup, next to `#score` in `index.html:259`:

```html
<span class="pill" id="capstonechip" hidden></span>
```

CSS beside the other pill rules (`index.html:34-43` block): a locked state
in the muted HUD grey, an edible state reusing the `#scorefill` green with
the existing `scoreSheen` animation so no new keyframes are needed, and an
eaten state at reduced opacity.

Render it from `updateHUD` in `src/ui/overlays.js`, from new optional
`state` fields (the function is documented as partial-safe, so adding
fields is backward compatible):

```js
//   capstone : { required, eaten, edible, blocker, shieldRemaining,
//                comboNeeded, comboBest } | null
```

- `!required` or `null`: `hidden = true`.
- `eaten`: `🏙️ landmark down`, muted.
- `edible`: `🏙️ EAT THE LANDMARK`, sheen on.
- `blocker === 'shield'`: `🛡️ landmark shielded · N more eats`.
- `blocker === 'combo'`: `🌀 portal sealed · combo N/M`.
- `blocker === 'size'`: `🏙️ landmark: grow bigger`.

Feed it from the single `updateHUD({...})` call (currently
`src/main.js:2127-2133`) using the `evaluateWin` result, so there is one
producer.

The banner: in the edibility pass, when `state.capstoneEdible` transitions
false to true, fire `showBanner('🏙️ THE LANDMARK IS EDIBLE — TAKE IT DOWN',
1600)` plus a sound, once per level (guard with a
`state.capstoneEdibleAnnounced` flag reset in the per-level reset that
already clears `state.capstoneEaten`). This is the "grow to eat THAT" beat
the design doc asks for and it is currently silent.

### 9.3 Mass bar must not read complete while gated

In `src/ui/overlays.js:251-254`, hold the fill short and mark it gated when
a capstone is outstanding:

```js
const capstoneOutstanding = state.capstone && state.capstone.required && !state.capstone.eaten;
const raw = (mass / state.target) * 100;
const pct = capstoneOutstanding ? Math.min(92, raw) : Math.max(0, Math.min(100, raw));
scorefillEl.style.width = `${pct}%`;
scorefillEl.classList.toggle('gated', Boolean(capstoneOutstanding));
```

with a `.gated` rule that changes the fill to a striped or amber treatment.
Invariant to hold: a full, ungated bar means the level is won.

### 9.4 L41-L50 landmark gate

At the landmark spawn (currently `src/main.js:735`):

```js
radius: Math.max(landmark.boundingRadius, capstoneGateRadius(level)),
```

The `max()` lets mega-spire's 73.6u geometry override the economy value, so
the gate needs base mass 1016 against a base target of 1000 (§4.3).
Preferred fix: make the economy radius authoritative and scale the MESH to
match, so the thing the player sees is the thing the gate measures:

```js
const gateRadius = capstoneGateRadius(level);
if (landmark.boundingRadius > gateRadius) {
  const k = gateRadius / landmark.boundingRadius;
  landmark.scale.multiplyScalar(k);
  landmark.boundingRadius = gateRadius;
}
// ...
radius: gateRadius,
```

Only mega-spire is affected at all, and only by a factor of
`capstoneGateRadius / 73.6` (0.88 at the expert tier), so the visual delta
is small. Verify on the live deployed URL, never localhost. If the shrunk
mega-spire reads wrong against its plaza, do NOT ship it: report back, and
the fallback is raising the expert-tier `capstoneGate` or lowering
`CAPSTONE_EDIBLE_MASS_FRACTION` until `needBase <= 1000` everywhere.

Re-run `node scripts/invariant-test.js` after this change specifically:
invariant 4 and invariant 5 both move, and determinism must stay
byte-identical.

### 9.5 Formatter collision above 99%

`src/ui/format.js` gains a progress-aware variant rather than changing
`formatCompact` (which many callers share):

```js
/**
 * Compact, but never renders as `reference` while short of it. Above 99% of
 * the reference the readout gains a significant figure so the last fraction
 * of a percent stays visible. See .wiki/0004 §4.4.
 */
export function formatProgress(n, reference) { /* ... */ }
```

Use it for the mass side of the `#score` readout only. Keep the truncation
direction: it may still under-report, it may never over-report.

### Regression tests (add with the fix, `scripts/logic-test.js`)

1. **The one that would have caught L41-L50**: for every level 1..100, with
   the real landmark bounding radius per metro, assert that the mass at
   which the capstone size gate opens is `<= level.target`. Model:
   `effRadius = max(boundingRadius, capstoneGateRadius(level))`, gate opens
   at avatar radius `effRadius / level.capstoneGate`, invert
   `radiusFromMass` for the base mass, compare against
   `level.target / level.itemValueMultiplier`. Today this fails on L41-L50
   at 1.016x, which is the point.
2. `evaluateWin` truth table: all four quadrants of
   `(massMet, capstoneMet)`, plus each `capstoneBlocker` value, plus the
   assertion that `blockingReason === 'capstone'` never produces the
   mass-blame sentence.
3. `formatProgress(m, t) !== formatProgress(t, t)` for every level target
   `t` and every `m` in `[0.99t, t)`.
4. Chip state is a pure function of the same inputs: assert the five states
   map correctly, in particular that `required && !eaten` never yields a
   full, ungated bar.

Gates before any commit: `node scripts/logic-test.js` (153/153 plus the new
cases), `node scripts/invariant-test.js` (9/9 across 100/100, determinism
byte-identical). No dev server, no localhost, live URL only for the 9.4
visual check.

## 10. What was implemented, and the review of it

Added 2026-07-27. §7 and §9 are the SPECIFICATION. This section is the record
of what an implementer (`winfix`) actually built and what a read-only review
of it found. The reviewer did not modify anything under `src/`.

### 10.1 Implemented, verified

All six items landed.

| item | where | verified |
|---|---|---|
| 9.6 `evaluateWin` | new `src/systems/win.js`, pure, imports only the gate constant | consumed by all four surfaces, see 10.2 |
| 9.1 fail copy | `failReasonText()` in win.js, rendered by `levelFail(win)` | all three blockers produce distinct copy |
| 9.2 chip | `capstoneChipState()` + `#capstonechip` in index.html | five states, all asserted |
| 9.3 gated bar | `massBarState()`, `GATED_BAR_MAX_PERCENT = 92`, `.gated` CSS | full ungated bar now implies won |
| 9.4 mega-spire | `capstoneEffectiveRadius()`, mesh scaled, `radius: gateRadius` | gate opens at 0.700x target on all 100 levels |
| 9.5 formatter | `formatProgress()` in format.js, `formatExtended` fallback, then a percent readout | no collision at any level |

Gate results at review time, on the full tree:

- `node scripts/logic-test.js`: **181 passed, 0 failed** (153 before, 28 added).
- `node scripts/invariant-test.js`, three consecutive runs: **ALL 9 INVARIANTS
  PASS, 100/100**, BUILD CEILING PASS, determinism byte-identical. The
  invariant 6 and build-ceiling red that was present mid-session came from
  concurrent geometry work and has cleared.
- `node scripts/build.js`: PASS.
- `gate-opens-at-or-under-target.mjs`: **PASS, 0/100 failures** (baseline was
  10/100 at ratio 1.016).

Two things worth recording beyond the spec:

- The §4.2 harness artefact is fixed at the ROOT, not papered over.
  `scripts/soak-bot.js` no longer takes landmark geometry as a gate input at
  all (the parameter is accepted and ignored for caller compatibility), because
  after 9.4 geometry cannot raise the gate. The standalone CLI is now honest:
  L10/41/50/61/100 all report `completed=true` with the capstone eaten, where
  before every capstone level reported `completed=false` with mass far over
  target.
- The chip's ready state is a solid high-contrast green, NOT the animated
  sheen §9.2 specified. `index.html`'s reduced-motion block is a global
  `animation: none !important`, so an animation-only "act now" signal would
  vanish silently for those players. This is a deliberate, correct deviation
  from the spec, not a miss.

### 10.2 `evaluateWin` really is the single source

Checked rather than assumed. Four consumers, all reading the one evaluation:
the timer-expiry branch, the per-frame branch, `levelFail` (via the `win`
argument, with an `evaluateWin` fallback for a direct call), and the HUD
payload that feeds both the chip and the bar. `levelFail` has exactly one
call site. No surface recomputes the conjunction locally, which was the drift
the extraction exists to prevent.

`state.capstoneEdible` is written in exactly one place, the per-frame
edibility pass, from the same `obj.radius <= swallowR * gate` comparison the
swallow itself uses. The chip cannot promise an eat the swallow would refuse.

### 10.3 The probe edit: legitimate, but it moved what is being tested

`winfix` edited this investigation's own probe
(`evidence/gate-opens-at-or-under-target.mjs`), replacing the restated
`Math.max(boundingRadius, capstoneGateRadius(level))` with a call to its new
`capstoneEffectiveRadius()`. Reviewed on the three questions that matter.

**Was the original line wrong?** No. It faithfully described the spawn as it
stood at the time it was written (`radius: Math.max(landmark.boundingRadius,
capstoneGateRadius(level))`). But it was a RESTATEMENT, so once the spawn was
fixed the probe would have kept reporting FAIL against a copy of the old rule.
`winfix`'s reason for editing it was correct.

**Is the new form vacuous?** No, and this was tested rather than argued. A
copy of the probe with a deliberately regressed helper
(`(b, g) => ({ radius: Math.max(b, g), meshScale: 1 })`) goes red immediately:
10/100 failures at exactly ratio 1.016, the original defect. The probe still
discriminates.

**What it now tests is narrower than what it used to.** It verifies the rule
as implemented in `win.js`. It no longer observes what `main.js` actually
spawns. If a future change reverted the spawn to `max(geometry, economy)`
while leaving `capstoneEffectiveRadius` correct, this probe and the matching
logic-suite case would both stay green while the defect was back in the game.
The same is true of the logic-suite balance check, whose comment claims it
"binds to production code": it binds to `win.js`, not to the spawn.

Residual risk is low (the helper exists only for this one call site) and the
current wiring was verified by reading `src/main.js`, where the capstone prop
takes `radius: gateRadius` from `capstoneEffectiveRadius` and the mesh is
scaled by the returned `meshScale`. But the guard has a hole in it.

**Recommended (route through an implementer, not the reviewer):** add one
wiring assertion to the logic suite so the chain is closed end to end. The
only link visible from Node is the source text itself, so the cheap version
is a check that `src/main.js` contains no `Math.max(landmark.boundingRadius`
and that the capstone prop's `radius:` is fed from the helper's result. It is
grep-shaped and slightly crude, and it is still worth having: it is the only
thing that would catch the spawn drifting away from the rule the tests
measure.

### 10.4 Test-coverage note on the acceptance sweep

The 100-level acceptance sweep asserting an over-target loss is never
rendered as "Time ran out at X / Y mass" runs with `shieldRemaining: 0` and
`portalComboNeeded: 0`, so the sweep itself only exercises the `size`
blocker. The shield and combo branches are covered, but by three separate
single-case checks beside it, and the `both` quadrant is asserted on
`evaluateWin` only, not on the copy it produces. Coverage is adequate; the
sweep is narrower than it reads.

Observability note: this was fully diagnosable from the repo's own headless
harnesses, no runtime logging needed. The one gap worth closing is that
`scripts/soak-bot.js` standalone lies about completion (§4.2); its CLI
branch should pass the real landmark radius the way `invariant-test.js`
does, or refuse to run without one.

## 10. What was actually implemented (2026-07-27)

All six §9 items are built. Files touched: `src/systems/win.js` (new),
`src/main.js`, `src/ui/overlays.js`, `src/ui/format.js`, `index.html`,
`scripts/logic-test.js`, `scripts/soak-bot.js`.

- **9.6 `evaluateWin`** — `src/systems/win.js`, pure, no THREE/DOM. Both call
  sites in `main.js` (timer expiry, per-frame) now read it, as do the fail
  copy, the HUD chip and the mass bar. `state.capstoneEdible` is written in
  the per-frame edibility pass from the same comparison the swallow makes, so
  the chip and the swallow cannot disagree at the boundary.
- **9.1 Fail copy** — `failReasonText()` in `win.js`, rendered by
  `levelFail(win)`. A capstone loss never blames the mass, and names the
  shield count or the portal combo when one of those is the real blocker.
- **9.2 HUD chip** — `#capstonechip` in `index.html`, rendered by
  `updateHUD({ capstone })` via `capstoneChipState()`. Five states. The
  edible transition fires a one-shot banner plus `Audio.grow()`.
- **9.3 Mass bar** — `massBarState()` holds the fill at 92% and adds `.gated`
  (amber stripes) while a landmark is outstanding. A full green bar now means
  exactly one thing: the level is won.
- **9.4 L41-L50 gate** — the spawn no longer takes `max(geometry, economy)`.
  `capstoneEffectiveRadius()` makes the economy radius authoritative and
  returns the scale the mesh must take; mega-spire shrinks by 0.88, every
  other landmark is untouched. **Needs a live-URL eyeball**: if the shrunk
  mega-spire reads wrong against its plaza, the fallback is in §7.4.
- **9.5 Formatter** — `formatProgress(n, reference)` in `format.js`, used for
  the mass side of `#score` only. Truncation direction preserved.

Deviations from the build sheet, both deliberate:

1. The chip's `ready` state is a solid high-contrast green, NOT the
   `scoreSheen` animation §9.2 suggested. `index.html`'s reduced-motion block
   applies a global `animation:none`, so an animation-only "act now" signal
   would silently vanish for those players. No exception was carved.
2. `scripts/soak-bot.js` no longer takes landmark geometry as a size-gate
   input at all (the gate is the economy radius everywhere now), which
   removes the §4.2 harness artefact at its root: the standalone CLI reports
   honest completion instead of `completed=false` on every capstone level.
   The `landmarkRadius` option is accepted and ignored for caller compat.

Gates at the time of writing: logic suite 181/181 (26 new cases, including
the §4.3 balance check and the 0004 acceptance test), `scripts/build.js`
passes, invariant determinism byte-identical, invariants 4/9 unaffected.
Invariants 5 and 7 fail at 97/100 (L6, L61, L87) and BUILD CEILING fails —
all pre-existing from concurrent `src/data/levels.js` work, none of them
capstone-related. `scripts/smoke-test.cjs` was NOT run: it drives a localhost
server, which the standing no-localhost rule forbids.

// Achievement dictionary — ported from the current shipped game's `ACH`
// object (recovered from git history: `git show 97c9024:index.html`, lines
// ~333-345). All 11 original keys are kept verbatim; flavor text is reworded
// ONLY where it explicitly named the old CRM/records theme (a literal "CRM"
// or "record" reference would be jarring against the new city setting) —
// the joke voice and title puns are otherwise untouched. Three new entries
// (metroCleared/centurion/hoarder) are added per the redesign plan, for 14
// keys total.
//
// Value shape is kept identical to the original: `[title, description]` —
// same 2-element array a UI/toast module indexes as `a[0]`/`a[1]`, just as an
// ES module export instead of an inline global.
//
// No browser-only API is touched anywhere in this file (pure data + logic),
// so a bare `import` never throws in Node.

export const ACH = {
  // --- Original 11, ported (unchanged unless noted) ---
  first: ['🥇 First Contact... Consumed', "You swallowed your first thing. There's no going back."],
  // was: "10 combo. The CRM is scared now." — "CRM" retargeted to the city.
  combo10: ['🔥 Double-Digit Devourer', '10 combo. The whole city is scared now.'],
  combo25: ['☄️ Extinction-Level Snacking', '25 combo. Scientists saw it from space.'],
  // was: "You ate a golden record." — "record" retargeted (city has no CRM records).
  gold: ['🌟 Shiny!', 'You swallowed a golden pickup. Legend says there are only a few.'],
  rival: ['🌀 Flywheel Domination', 'You ate a rival flywheel. There can be only one.'],
  // was: "Touch more records." — retargeted to the new swallow-target: the city.
  fast: ['⚡ Speedrunner', 'Half the target with 30+ seconds left. Touch grass? No. Touch more city.'],
  // was: "Ate 5 sync-storm drops." — "sync-storm" (data-sync jargon) softened to plain "storm".
  storm: ['🌩️ Storm Chaser', 'Caught 5 storm drops out of the sky. Delicious weather.'],
  // was: "The CRM trembles." — "CRM" retargeted to the city.
  god: ['👾 Cheat Code Accepted', 'The whole city trembles. You monster. You beautiful monster.'],
  // "unsub" is the literal typed-word easter egg trigger, kept unchanged (redesign
  // plan explicitly keeps Konami/unsub/breeze easter eggs as-is) — no CRM jargon to retarget.
  unsub: ['📭 Unsubscribed From Physics', 'Gravity has left the chat.'],
  // "Breeze" is the deliberate HubSpot-Breeze-AI homage the finale metro (Capital
  // Prime) keeps on purpose (see src/data/metros.js), so left as-is.
  breeze: ['🤖 Breeze Overclock', 'You summoned the AI. To eat it.'],
  // was: "All 10 Hubs consumed. The funnel is full. Of nothing." — "10 Hubs"/"funnel"
  // were literal old-game structure (10 Hubs) that no longer exists (now 10 metros).
  win: ['🏆 Metropolis Apocalypse', 'All 10 metros consumed. The skyline is empty. Of everything.'],

  // --- New, required by the city/100-level redesign ---
  // Fires each time a metro's 10th-level capstone landmark is eaten.
  metroCleared: ['🏙️ Metro Cleared', 'You swallowed an entire metro whole — capstone landmark and all.'],
  // Fires on completing level 100 (the whole 10-metro run).
  centurion: ['💯 Centurion', 'Level 100. You just ate a hundred levels of city. Take a bow.'],
  // Fires at 50 distinct Skyline-opedia collection entries (collection-size
  // check itself lives in the Skyline-opedia module; see checkHoarder() below).
  hoarder: ['📖 Skyline Hoarder', "50 entries logged in the Skyline-opedia. You've catalogued the whole city's junk drawer."],
};

// Collection size a Skyline-opedia module must reach to unlock `hoarder`.
// Kept here (next to the achievement it gates) rather than duplicated at
// each call site; the actual distinct-entry count is owned/tracked elsewhere.
const HOARDER_THRESHOLD = 50;

// Pure predicate: does this many distinct Skyline-opedia entries unlock the
// `hoarder` achievement? The collection itself (what counts as an "entry",
// how it's persisted) is a different module's concern — this just answers
// the threshold question so that module doesn't have to hardcode `50`.
export function checkHoarder(collectionSize) {
  return collectionSize >= HOARDER_THRESHOLD;
}

// Tracks which of the 14 ACH keys have been unlocked this playthrough — the
// module-ized equivalent of the original's `achUnlocked = new Set()`.
export function createAchievementTracker() {
  const unlocked = new Set();

  // Unlocks `key` if it exists and isn't already unlocked (idempotent, EXACT
  // guard from the original `achieve()`: `if(achUnlocked.has(id)) return;`).
  // Returns the `[title, description]` entry on a fresh unlock (for a caller
  // to show a toast/banner with), or null if unknown/already-unlocked — this
  // module stays UI-free, so it hands back data rather than rendering anything.
  function unlock(key) {
    if (!Object.prototype.hasOwnProperty.call(ACH, key)) return null;
    if (unlocked.has(key)) return null;
    unlocked.add(key);
    return ACH[key];
  }

  function has(key) {
    return unlocked.has(key);
  }

  // All currently-unlocked keys, as a snapshot Set (mutating the returned Set
  // does not affect tracker state).
  function all() {
    return new Set(unlocked);
  }

  return { unlock, has, all };
}

# July 29 Cross-Repository Recovery

Status: locally remediated on `recovery/2026-07-29-full`; remote promotion and
live verification remain gated on explicit deployment approval.

## Load-bearing identity

- The recovery baseline is V2 commit `fdaee14`.
- Level 1 remains `The Loop · Chicago` with `authoredCity: chicago-loop`.
- The player remains the ground-flush hole/flywheel from
  `src/engine/avatar.js`; the V1 sphere/orb is historical and rejected.
- The V1 checkout at `../funnel-hub` remains read-only.

## Preserved evidence

- `C:\tmp\funnel-hub-2-2026-07-29-recovery.bundle`
- `C:\tmp\funnel-hub-2-2026-07-29-recovery-after-import.bundle`
- `refs/recovery/v2-main-before-remediation` (`fdaee14`)
- `refs/recovery/remote-main-before-remediation` (`419037f`)
- `refs/recovery/v1-july29-complete` (`1bdb22a`)
- `refs/recovery/v1-art-revert` (`d0cdd41`)
- `refs/recovery/v2-restore-marker` (`4480bdf`)

## Source-commit disposition

| Source | Intended work | V2 disposition |
|---|---|---|
| `612da3f` | Four base textures, Bokeh DOF, facade wiring, camera-relative steering | All four images and eight required postprocessing modules imported byte-for-byte. DOF ported into V2's quality ladder. V2's gesture-stable steering at `fdaee14` supersedes the older per-frame V1 implementation. |
| `eb0d446` | Playtest remediation | Square-root growth drag and 0.65 speed floor ported. V2 already has too-big wobble/lock feedback. Camera shake rejected because V2's hero contract explicitly forbids it. The V1 speed-bump builder is absent from V2's authored object pipeline. |
| `f82e863` | Camera scaling refinement | Superseded by V2's radius-derived 17.5r camera, critically damped heading follow, look-ahead, and orbit system. Copying the V1 absolute-distance curve would violate lesson B2. |
| `44e68f5` | Per-metro art overhaul | All 105 images, font, manifest, bloom/vendor modules imported byte-for-byte. Fifty metro surface textures are wired through V2's texture loader; 45 icons feed build and achievement UI. Chicago keeps its approved photoreal set. V1-only sphere, fictional-Level-1 routing, duplicate save/meta, metro-prop, debris, and overlay implementations are rejected in favor of their V2 equivalents. |
| `1bdb22a` | Vercel build/output configuration | `vercel.json` already exists byte-identically on the V2 baseline; retained. |
| `d0cdd41` | Revert the art overhaul | Explicitly excluded. |
| `4480bdf` | Restore V2 production tree | Empty tree-equivalent marker; preserved as evidence, no content to port. |
| `419037f` | Deploy the `612da3f` tree | Its `vercel.json` is byte-identical to `1bdb22a`; the truncated V1 tree is not a recovery source. |

## Completeness gates

- The recovered asset inventory is exactly 109 images: 4 from `612da3f` and
  105 from `44e68f5` (60 textures and 45 icons).
- All 121 imported asset blobs (images, font, manifest, vendor modules) match
  their source Git blob hashes; mismatches: zero.
- `npm test`: 243 logic checks pass; all nine invariants pass across 100/100
  levels; placement audit passes.
- `npm run build`: passes; all 109 recovered images appear in `dist`.
- Automated Gate Zero rejects a non-Chicago Level 1 or a sphere avatar.

## Remaining release gate

The repaired branch must be published as an isolated preview and checked on
an authorized live URL at 360×640, 800×450, and desktop before it may replace
`main`. No local server is an acceptance surface. Remote `main` may move only
with `--force-with-lease` against the recorded `419037f` and explicit owner
approval.

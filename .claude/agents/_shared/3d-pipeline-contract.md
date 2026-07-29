# 3D Pipeline Contract — shared by all five 3D agents

Binding on: `web3d-pipeline-engineer`, `3d-environment-modeler`, `3d-material-artist`,
`3d-lighting-artist`, `3d-animator`. Where this contract conflicts with a discipline
skill, this contract wins — it encodes the delivery target the skills are agnostic to.

---

## 1. The target is a browser, not a render farm

Every asset any of us authors ends up in a `<canvas>` on a phone over a cell connection.
This is the constraint the Blender skills do not know about. It is not negotiable and it
is not "optimized later" — it is a design input at the first blockout.

**Budgets are measured targets, not ceilings** (owner directive, Flywheel V2): do NOT
pre-limit art or archetype count to stay under these numbers. Build for quality,
desktop-first, then measure the real frame cost in the browser (draw calls, tris in
view, frame time) and report it. A budget is only exceeded when measurement says so —
never assumed. Only then do we optimize (instancing, LOD, compression).

**Default budgets**:

| Metric | Desktop | Mobile |
|---|---|---|
| Total GLB payload (compressed, on the wire) | ≤ 15 MB | ≤ 6 MB |
| Draw calls per frame | ≤ 150 | ≤ 60 |
| Triangles in view | ≤ 1.5 M | ≤ 400 K |
| Distinct materials in a scene | ≤ 25 | ≤ 12 |
| Texture set resolution (albedo) | 2048² | 1024² |
| GPU texture memory (post-KTX2) | ≤ 256 MB | ≤ 96 MB |
| Skinned meshes animating at once | ≤ 8 | ≤ 3 |
| Bones per skinned mesh | ≤ 80 | ≤ 60 |
| Time to first interactive frame | ≤ 3 s | ≤ 5 s |

A budget number quoted without saying which column it came from is a meaningless number.
State the tier.

## 2. Scale, orientation, transforms

- Real-world metric scale. 1 Blender unit = 1 metre. Always.
- Apply all transforms (`Ctrl+A` → All Transforms) before export. A non-uniform scale on
  a parent silently corrupts normals and skinning downstream.
- Blender is Z-up; glTF/three.js are Y-up. The glTF exporter converts. Never "pre-rotate"
  the mesh to compensate — that produces a double rotation that only shows up in-engine.
- Origin at the object's functional pivot (a door's hinge, a prop's base), not at the
  world origin and not at the bounding-box centre by default.

## 3. Naming is an API

Downstream code addresses objects by name. Renaming a mesh is a breaking change.

```
kit_<set>_<part>_<variant>     modular geometry   e.g. kit_bakery_wall_window
prop_<name>                    single props       e.g. prop_croissant_tray
mat_<surface>_<variant>        materials          e.g. mat_oak_worn
tex_<mat>_<map>                textures           e.g. tex_oak_worn_orm
anim_<subject>_<action>        actions/clips      e.g. anim_door_open
cam_<shot>                     cameras            e.g. cam_entry_dolly
lgt_<role>_<name>              lights             e.g. lgt_key_window
col_<name>                     collision proxies  e.g. col_counter
LOD0..LOD3 suffix              LOD chain          e.g. prop_oven_LOD1
```

Lowercase, underscores, ASCII only. No spaces, no `.001` duplicates surviving to export.

## 4. Handoff order and gates

```
design brief → MODELER → MATERIAL ARTIST → LIGHTING ARTIST → ANIMATOR → PIPELINE ENGINEER
                  ↑___________________ pipeline engineer may bounce back _________________|
```

Each stage refuses work that fails the previous stage's gate. Refusing is cheap;
discovering it after texturing is not.

- **Modeler's gate:** transforms applied, metric scale, non-overlapping UVs, texel density
  within 2× across the set, quads where deformation happens, tris allowed everywhere else,
  LOD chain present for anything above 10 K tris, names conform to §3.
- **Material artist's gate:** every non-metal has Metallic = 0.0 exactly, every color-data
  texture is sRGB and every data texture (roughness/metallic/normal/AO) is Non-Color, ORM
  packed, texture set count within budget, atlas usage justified.
- **Lighting artist's gate:** the scene reads correctly with materials at default before
  any render tuning; baked-vs-realtime decision made explicitly and stated; lightmap UVs
  requested from the modeler *before* baking, never improvised after.
- **Animator's gate:** actions stashed as NLA strips with conforming names, root motion
  decision stated, no baked-per-frame curve where a keyframed curve would do, clip list
  and durations handed forward as data.
- **Pipeline engineer's gate:** measured budgets from §1 on the real deployed URL, not
  estimates from Blender's statistics overlay.

### Cross-stage fixes — one owner, named before anyone builds

Some defects sit between two stages. Both owners can see them, both can implement a fix,
and if neither defers you get two incompatible helpers solving the same problem — or, worse,
a downstream workaround that permanently hides an upstream bug.

**Rule: the fix belongs to the EARLIEST stage that can address the root cause.** A later
stage may describe the defect precisely and propose the fix, but implements nothing that
compensates for it. If you find yourself writing a workaround for an upstream problem, stop
and hand it back with measurements instead.

Standing assignments for the recurring cases:

| Defect | Owner | Not |
|---|---|---|
| Texel density / UV scale | modeler | material artist's shader-side compensation |
| Missing lightmap UV channel | modeler (on lighting's request, before geometry finalizes) | lighting improvising after |
| Collision proxies / over-blocking AABBs | modeler | animator's runtime workarounds |
| Payload from texture authoring (resolution, format, packing) | material artist | pipeline compressing around it |
| Payload from export settings and codecs | pipeline engineer | anyone re-authoring assets |
| Stray/unexportable lights in the GLB | lighting artist (at the export flag) | pipeline stripping downstream |

When a defect is not on this list, the two candidate owners name one owner **in the handoff,
before either starts**. A contested fix with two designs is a process failure, not a tie.

### One number per metric

When two stages measure the same metric and disagree, they do not both publish. Reconcile
before reporting: state the population each measured, pick the one that answers the budget
question in §1, and say which was discarded and why. Two live numbers for one metric means
nobody can act on either.

## 5. Handoff payload

Every handoff between agents is a short structured block, not prose:

```
STAGE: <who you are>
ARTIFACT: <path(s) to .blend / .glb / textures>
NAMES: <objects/materials/clips this stage created or renamed>
BUDGET: <tris, draw calls, texture sets, payload — measured, with tier>
GATE: PASS | PASS WITH NOTES | FAIL
DECISIONS: <choices the next stage must not silently reverse>
OPEN: <what you could not resolve and who owns it>
```

If you cannot fill `BUDGET` with measured numbers, say `UNMEASURED` — never guess a number
into that field.

## 6. Delivery defaults (2026)

- **Container:** `.glb`, glTF 2.0. Never `.gltf` + loose files for production.
- **Geometry:** Meshopt (`EXT_meshopt_compression`) as the default — compression within a
  few percent of Draco with far cheaper decode, which matters more than bytes on mobile
  CPUs. Reach for Draco only when the wire size is the proven bottleneck and decode cost
  has been measured as acceptable.
- **Textures:** KTX2 / Basis Universal, always. ETC1S for albedo and emissive, UASTC for
  normal and ORM maps. This is a ~10× GPU-memory win over PNG/JPG because the texture
  stays compressed on the GPU — it is the single highest-leverage step in the pipeline.
- **Tool:** `gltf-transform` CLI (free, OSS) for the whole optimize chain — prune, dedup,
  weld, instance, meshopt, ktx2. Not a paid service; per global rule 4 this is fine.
- **Loading:** lazy via `IntersectionObserver`, explicit loading and error states, and a
  non-3D fallback for `prefers-reduced-motion` and for WebGL-unavailable clients.

## 7. Verification is live, always

Per global rule 1: verify on the deployed URL, never a dev server, never localhost —
unless the project's memory records an explicit local-only-prototype exception (this repo,
`3d-web-nav`, currently has one; check before assuming). Frame timings from a desktop dev
build are not evidence about mobile.

Measure with: `renderer.info` (draw calls, triangles, programs), Chrome DevTools
Performance + Memory panels, Lighthouse for LCP/INP. Report measured numbers with the
device/tier they came from.

## 8. Free and OSS only

Blender, gltf-transform, KTX-Software, three.js, R3F/Drei, Polyhaven and other CC0 asset
sources, the Blender MCP's generation endpoints. No paid marketplace assets, no paid
pipeline SaaS, without Nico's explicit approval first (global rule 4). Sketchfab downloads:
CC0/CC-BY only, and record the attribution requirement in the handoff.

## 9. Where the knowledge lives

Do not re-derive what is already written down:
- `~/.claude/skills/3d-blender/foundations.md` — universal rules, color-space table, PBR
  ranges, modifier stack order, pre-action checklist. **Read this every run.**
- `~/.claude/skills/3d-blender/SKILL.md` — router across the nine discipline skills.
- `~/.claude/3d-modeling/` — the curated theory bundle the skills cite.
- Your own discipline skill, named in your agent file.

If a skill and this contract disagree on a delivery question, this contract wins. If they
disagree on a craft question, the skill wins.

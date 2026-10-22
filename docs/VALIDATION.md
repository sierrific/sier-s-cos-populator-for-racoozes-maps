# Validation

Automated validation checks manifest/version coherence, all 36 Racooze Scene definitions, unique source identities and deterministic keys, exact Scene bounds, verified and non-duplicated anchors, consistent Actor contracts, hidden/warned/reviewed conditional encounters, explicit-position bounds and collisions, Castle composite-floor transforms, absence of legacy level-based code, and absence of prohibited raw assets/data.

Core tests run the placement planner across all 36 Scene variants and cover all 15 locations, 226 encounter records, and 834 declared Token instances. Regression cases cover idempotent second planning, strict ownership and scoped removal, explicit-position collisions, Actor ambiguity/import ownership, manual anchors, partial-create rollback, Scene source and structural fingerprint scoring, wrong-location rejection, padded canvas bounds, unresolved-anchor blocking, encounter navigation, Castle composite transforms, Scene-configuration fingerprints, and token-only fingerprints.

The release audit rebuilds the canonical source file list, checks ZIP path safety, fixed timestamps, UTF-8 entry names, portable permissions, byte identity, checksum integrity, installer targets and symbolic-link guards, workflow assets, and documentation links.

## v14 compatibility update (0.3.0)

The compatibility suite runs independent v12, v13, and v14 API fixtures. The v14 fixture deliberately omits former global constructors and UUID helpers. It covers module initialization, the settings menu, unchanged tab configuration, both control collection formats, GM restrictions, modern/legacy confirmations, configured document classes, UUID overrides, Token construction with the parent Scene, native level IDs, same-level collisions, width/height preservation, idempotency, scoped removal, navigation, both Graphics drawing interfaces, and anchor cancellation on canvas teardown.

Native-level regression cases cover all 36 Scene variants with a migrated single-level fixture, half-open elevation ranges, missing/overlapping level rejection, manual level selection, and rejecting stale plans before population, reconciliation, or rebuild. Native Level document changes are also covered by mutation fingerprints.

These are mocked API-contract tests, not a v14 browser run. Read-only inspection of the Oracle installation during this update confirmed Foundry 12.331. No server installation, restart, World migration, or GitHub publication was performed. The manifest permits v12-v14 but keeps its previously verified runtime version. See [v14 smoke-test checklist](FOUNDRY-V14.md).

## Historical runtime result (0.2.1)

Validated through 2026-08-13 in the Oracle-hosted `curse-of-strahd-autonomous` World with Foundry 12.331, D&D5e 3.1.2, Racooze's maps 1.0.7, and Plutonium 2.1.3.

- Active Racooze Scenes automatically select the matching location. Resolution now requires Racooze provenance, a Scene-specific identity signal, and exact geometry; a cross-location false positive found during browser testing is covered by regression tests.
- Actor resolution is fail-closed. World Actors resolve first, followed by configured compendiums and the D&D5e SRD; missing CoS Actors can be imported through Plutonium.
- The DotMM-aligned Review/Actors/Anchors/Execute UI rendered. The Plutonium control now opens with `Creatures` selected; the CoS `Madam Eva` and `Broom of Animated Attack` Actors imported after enabling Plutonium's `Adventure NPC` filter.
- Tser Pool preview planned 24 Tokens. Persistent population created 24, a second run created zero, and all 24 remained recognized after a server restart. The three wagon captains are hidden and flagged for GM review.
- Visual review confirmed the Grick in area 28, the Mimic door in area 33, and both Ghast cavities in area 34 after applying Racooze's 90-degree Basement 1 tile transform.
- Death House retained the earlier four module-owned static Tokens and previewed the newly enabled hidden conditional placements with their adjacent warning codes. One fourth Ghoul position remained fail-closed because the current occupied geometry offered no collision-free square.
- Castle Ravenloft resolved both the composite Scene (`All floors (flat)`, 29/29 used anchors) and the separate F1 Scene (2/2 anchors). Persistent Castle actions stayed blocked while required Actors were missing.
- The test World was left with 24 module-owned Tokens on Tser Pool and the earlier four module-owned Tokens on Death House. The original PM2 Foundry process remains stopped and preserved; only the temporary `foundry-cos-test` process is online.
- Version 0.2.1 was installed with a verified SHA-256 checksum through the corrected Unix installer, preserving each prior installation under `Data/module-backups`. The World completed startup without server errors. The restart invalidated the browser login session, so no new post-install visual claim is made without the Foundry user password; earlier runtime/visual evidence remains documented above.

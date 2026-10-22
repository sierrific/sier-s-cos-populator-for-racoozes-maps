# Sier's CoS Populator for Racooze's Maps

A local-first Foundry VTT v12-v14 module that adds a GM-reviewed encounter layer to Racooze's Curse of Strahd maps without modifying or redistributing those maps.

## Current scope

Version 0.3.0 covers all 36 Scenes shipped by Racooze's CoS Maps 1.0.7, grouped into 15 campaign locations. Both flat and Levels variants are supported where supplied, and Castle Ravenloft supports its composite Scene plus every individual floor.

The v14 compatibility update preserves the DotMM-style interface and supports native Scene Level references. Automated API-contract tests cover v12, v13, and v14; browser verification remains at 12.331. A licensed v14 world smoke test is still pending, so the manifest intentionally retains `verified: 12.331` while allowing installation through v14. See [v14 compatibility and testing](docs/FOUNDRY-V14.md).

Static occupants are placed normally. Itinerant NPCs, dormant creatures, summons, reinforcements, and triggered appearances are prepared as hidden Tokens with a warning beside the encounter. Pure random-encounter tables remain excluded.

The module never packages adventure prose, statblocks, Racooze assets, 5e.tools data, or Foundry World data. Actors are resolved from the World or imported by the GM, including through Plutonium.

## Install

In Foundry Setup, open **Add-on Modules → Install Module**, paste this public URL into **Manifest URL**, and click **Install**:

`https://github.com/sierrific/sier-s-cos-populator-for-racoozes-maps/releases/latest/download/module.json`

Enable the module in your World alongside Racooze's maps. The manifest and module ZIP are publicly downloadable; no GitHub login or access token is required. See [Installation](docs/INSTALLATION.md) for requirements and manual installation.

For manual installation, download `racooze-cos-populator-0.3.0.zip` from the [GitHub release](https://github.com/sierrific/sier-s-cos-populator-for-racoozes-maps/releases/tag/v0.3.0) and extract it under `Data/modules/racooze-cos-populator/`. The local build is `dist/racooze-cos-populator-0.3.0.zip`; building locally does not publish it.

See the [User Guide](docs/USER-GUIDE.md), [technical design](docs/TECHNICAL.md), [coverage](docs/COVERAGE.md), and [validation evidence](docs/VALIDATION.md).

## Safety contract

- GM-only persistent actions.
- Preview before population.
- Deterministic ownership flags and idempotent population keys.
- Strict ownership validation rejects malformed or foreign flags before any removal or reconciliation.
- Conditional/event-triggered encounters are hidden and explicitly warned before population.
- Explicit positions are bounds-checked and collision-checked against existing and newly planned Tokens.
- Tested Racooze Scene fingerprints block stale anchors after structural map changes.
- Removal, reconciliation, and rebuild target only module-flagged Tokens.
- Scene configuration and non-Token embedded documents are fingerprinted before and after mutations; partial failures roll back.

Licensed under the [MIT License](LICENSE). Racooze's maps, Curse of Strahd, D&D, Foundry VTT, Plutonium, and 5e.tools remain the property of their respective owners.

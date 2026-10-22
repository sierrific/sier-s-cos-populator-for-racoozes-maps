# Installation

## Requirements

- Foundry VTT v12-v14 (live-tested on 12.331; v13/v14 API-contract tests only)
- D&D5e compatible with the installed Foundry generation (minimum 3.1.2; do not use that old version on v14)
- Racooze's CoS Maps 1.0.7
- Scene Packer recommended for stronger source identification
- Plutonium optional for GM-side Actor imports

The package is adapted for v14 but has not yet been browser-tested there. Foundry may display an unverified-version warning because `verified` remains 12.331. This does not prevent installation on v14. Dependency compatibility is independent: the populator does not upgrade or override Racooze, Scene Packer, Plutonium, or dnd5e manifests. Back up your World and check those packages before migrating. See [v14 compatibility](FOUNDRY-V14.md).

## Private GitHub release

1. Sign in to GitHub with access to this repository and open the [0.3.0 release](https://github.com/sierrific/sier-s-cos-populator-for-racoozes-maps/releases/tag/v0.3.0).
2. Download `racooze-cos-populator-0.3.0.zip`. The separate `module.json` and SHA-256 checksum are also attached; the ZIP already contains `module.json` at its root.
3. Extract the module as described below, reload Foundry, and enable it with Racooze's maps in the target World.
4. Open **Game Settings → Configure Settings → Module Settings → Sier's CoS Populator**.

Foundry cannot authenticate to these private GitHub release URLs. Pasting the private JSON URL into its manifest installer will not work; updates also require manual download. Never place an access token in a module manifest or installation URL.

For manual installations, extract the ZIP so `module.json` is directly under `Data/modules/racooze-cos-populator/`. Do not place the repository root in the modules directory.

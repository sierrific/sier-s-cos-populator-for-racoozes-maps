# Installation

## Requirements

- Foundry VTT v12-v14 (live-tested on 12.331; v13/v14 API-contract tests only)
- D&D5e compatible with the installed Foundry generation (minimum 3.1.2; do not use that old version on v14)
- Racooze's CoS Maps 1.0.7
- Scene Packer recommended for stronger source identification
- Plutonium optional for GM-side Actor imports

The package is adapted for v14 but has not yet been browser-tested there. Foundry may display an unverified-version warning because `verified` remains 12.331. This does not prevent installation on v14. Dependency compatibility is independent: the populator does not upgrade or override Racooze, Scene Packer, Plutonium, or dnd5e manifests. Back up your World and check those packages before migrating. See [v14 compatibility](FOUNDRY-V14.md).

## Install with Foundry

1. In Foundry Setup, open **Add-on Modules → Install Module**.
2. Paste this URL into **Manifest URL**, then click **Install**:

   `https://github.com/sierrific/sier-s-cos-populator-for-racoozes-maps/releases/latest/download/module.json`

3. Launch your World and enable the module with Racooze's maps.
4. Open **Game Settings → Configure Settings → Module Settings → Sier's CoS Populator**.

The repository and release assets are public. The manifest supports Foundry's installer/updater without GitHub authentication. Never place an access token in a module manifest or installation URL.

## Manual installation

1. Open the [0.3.0 release](https://github.com/sierrific/sier-s-cos-populator-for-racoozes-maps/releases/tag/v0.3.0) and download `racooze-cos-populator-0.3.0.zip`.
2. Extract the ZIP so `module.json` is directly under `Data/modules/racooze-cos-populator/`. Do not place the repository root in the modules directory.
3. Reload Foundry and enable the module in your World.

The standalone `module.json` and SHA-256 checksum are also attached to the release; the ZIP already contains `module.json` at its root. The original 0.3.0 ZIP was published while the repository was private, so its bundled README mentions manual-only installation. That note is obsolete; the published ZIP and its checksum are unchanged.

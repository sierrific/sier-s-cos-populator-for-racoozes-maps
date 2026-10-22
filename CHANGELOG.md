# Changelog

## 0.3.0 — Foundry v14 compatibility

- Expanded runtime and manifest support to Foundry v12-v14; retained `verified: 12.331` until a live v14 smoke test.
- Supported the v13/v14 record-based Scene Controls API while retaining v12 arrays.
- Replaced removed global lookups with canonical namespaces/configured document classes and safe version fallbacks.
- Preserved the DotMM-style form and tabs through the still-supported namespaced ApplicationV1 API; modern confirmation dialogs default to cancellation.
- Added explicit native Scene Level assignment, level-aware Token occupancy, previews and encounter navigation, and fail-closed ambiguous/stale level checks.
- Included native Level documents in mutation fingerprints and preserved planned Token dimensions.
- Cleaned up previews and pending anchor authoring when the canvas tears down.
- Added automated v12/v13/v14 compatibility fixtures, including all 36 migrated single-level map variants. No live v14 testing or server upgrade is claimed.
- Included a standalone installer manifest in build output and future release assets; no release is published by local validation.

## 0.2.1 — Safety and campaign-wide audit

- Validated all 15 locations, 36 Scene variants, 226 encounters, and 834 declared Token instances through the runtime data contract and placement planner.
- Added strict module-token flag validation so malformed or foreign flags cannot be removed or reconciled as owned Tokens.
- Added explicit-position collision and bounds validation, fixed the Berez overlap, and removed duplicate Death House anchors.
- Required hidden conditional encounters to carry both a warning code and explicit human-review status.
- Stopped Actor import cleanup from deleting managed Actors; duplicates are preserved and reported for GM review.
- Reduced duplicate review warnings in the UI and hid routine Scene-candidate diagnostics after an unambiguous match.
- Added symbolic-link rejection to both offline installers.
- Added Racooze 1.0.7 structural fingerprints for all 36 Scenes; changed Walls, Lights, Notes, Tiles, or Drawings now block matching with `SCENE_FINGERPRINT_MISMATCH`.
- Extended mutation fingerprints to Scene geometry, grid, backgrounds, and Levels/wall-height configuration.
- Added optional concise debug logging through Foundry's module settings.

## 0.2.0 — Campaign-wide Racooze coverage

- Added all 36 Racooze CoS Scenes across 15 location groups, including flat and Levels variants.
- Added a composite-floor transform for Castle Ravenloft plus its ten individual floor Scenes.
- Added hidden, warned preparation Tokens for itinerant NPCs, dormant creatures, summons, reinforcements, and triggered appearances.
- Preserved fail-closed actor and anchor resolution, deterministic ownership flags, idempotency, and token-only mutation safeguards.
- Kept random encounter tables and copyrighted adventure/map assets out of the package.

## 0.1.0 — Death House prototype

- Added the Death House prototype gate with four automatic hidden Tokens and five conditional review-only encounters.
- Matched the DotMM Populator UI structure and added a Plutonium creature-import fallback.
- Added exact Racooze canvas positions accounting for the 90-degree Basement 1 tile rotation.
- Runtime-tested preview, population, idempotency, scoped removal, and repopulation on Foundry 12.331/D&D5e 3.1.2.
- Added campaign/location/scene/area data architecture.
- Added strict Racooze Scene resolution with source, geometry, and ambiguity guards.
- Added World/compendium Actor resolution, Plutonium handoff, and explicit UUID overrides.
- Added verified anchors for the three static Death House encounter areas.
- Added preview, deterministic population, idempotency, reconciliation, scoped removal/rebuild, rollback, and token-only safety verification.
- Marked five event-triggered encounters as review-only and blocked them from automatic population.

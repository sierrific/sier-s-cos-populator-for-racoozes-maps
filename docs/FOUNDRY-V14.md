# Foundry v14 compatibility

Version 0.3.0 adapts the module for v12-v14. It does not upgrade Foundry, dnd5e, Racooze's maps, Scene Packer, Plutonium, or the legacy Levels module. Each dependency must independently support your installed Foundry version.

At review time the [Foundry listing for Racooze's CoS Maps 1.0.7](https://foundryvtt.com/packages/racoozes-cos-maps) still declared verified v13. That third-party verification status is not changed by this release.

## API changes

- Scene Controls now use named records and `onChange`; the module handles both this API and v12's array/`onClick` API. [SceneControlTool](https://foundryvtt.com/api/v14/interfaces/foundry.SceneControlTool.html)
- The original form and four tabs are deliberately retained through `foundry.appv1.api.FormApplication`, still available in v14. This is a compatibility update, not an ApplicationV2 rewrite. [FormApplication](https://foundryvtt.com/api/v14/classes/foundry.appv1.api.FormApplication.html)
- UUID resolution uses `foundry.utils.fromUuid`, with a v12 fallback. Actor/Folder/Scene creation uses configured document classes, preserving system subclasses. [fromUuid](https://foundryvtt.com/api/v14/functions/foundry.utils.fromUuid.html)
- Confirmations use `DialogV2` when available; closing or canceling never authorizes a mutation. [DialogV2](https://foundryvtt.com/api/v14/classes/foundry.applications.api.DialogV2.html)
- Background matching and mutation fingerprints understand native Level documents. Tokens explicitly receive a level ID and retain their planned elevation. Encounter navigation uses `scene.view({level})` and preview is limited to the viewed level. [LevelData](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.LevelData.html), [TokenData](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.TokenData.html), [SceneViewOptions](https://foundryvtt.com/api/v14/interfaces/foundry.documents.types.SceneViewOptions.html)

## Native level policy

Single-level imports use that level, including existing negative or positive dataset elevations. For multiple levels, the module requires one range containing the placement elevation (bottom inclusive, top exclusive). Missing or overlapping ranges block persistent population; they are never resolved from the GM's current view. A manually authored anchor can explicitly select its viewed level. Plans are invalidated when Level data changes after review.

This does not promise automatic support for arbitrary merged maps or coordinate changes introduced by third-party migration. Original geometry and Racooze structural fingerprints remain mandatory. Original flat/composite variants remain available; custom native multi-level conversions need visual review. The module never edits Level documents or rewrites Racooze map data.

## Test status

`npm run validate`, `npm test`, `npm run build`, and `npm run audit` are the local release checks. Compatibility tests exercise mocked APIs for v12/v13/v14 and single-level migration fixtures for all 36 map variants. They cannot establish visual rendering or third-party interoperability in a running v14 installation.

The available Oracle server is still on 12.331; it was inspected read-only. The manifest therefore retains `verified: 12.331` with `maximum: 14`. An unverified warning on v14 is intentional until the following checks are completed in an isolated, backed-up v14 world.

## Pending live smoke test

1. Use v14-compatible dnd5e, Racooze maps, and optional importer versions. Import a fresh Racooze flat map and duplicate it for testing.
2. Enable the populator, reload, and open it through both Token controls and Module Settings. Verify Review, Actors, Anchors, and Execute match the existing workflow.
3. Resolve/import Actors and save UUID mappings. Check that cancellation and window closure make no changes.
4. Preview, create missing, create missing again (zero new Tokens), and remove only module-owned Tokens. Verify hidden entries, token sizes, elevation, and unchanged map documents.
5. Repeat on a native multi-level copy. View each level, inspect previews, click encounters, and confirm Token level IDs. Test ambiguous ranges and stale-plan rejection.
6. Begin anchor authoring, then press Escape, close the window, or change Scenes. Check for no stuck UI or unhandled errors.
7. Record the exact Foundry and dependency builds and browser results before updating `verified`.

# Technical design

The data hierarchy is `campaign → location → Scene → area → encounter → token instance`. The deterministic key joins campaign, location key, Scene key, area, encounter ID, Actor key, and one-based instance number.

Ownership flags are accepted only when the campaign, schema version, location, Scene, area, encounter, Actor, and positive instance fields all satisfy the module contract. A malformed or foreign flag is treated as unowned data and is never a removal target.

Scene resolution scores source Scene ID, Racooze source metadata, normalized names, exact dimensions, grid, padding, and optional background basename. It also requires the tested Racooze 1.0.7 counts for Walls, Lights, Notes, Tiles, and Drawings. A mismatch fails closed with `SCENE_FINGERPRINT_MISMATCH`. The active Scene is preferred when valid; equal top scores outside it are reported as ambiguous.

Anchors resolve in this order: manual world setting, uniquely labeled Scene documents, then dataset fallback. Dataset fallbacks require exact geometry and `verified: true`.

Persistent operations fingerprint Tokens, Scene dimensions/grid/backgrounds/Levels configuration, and every non-Token embedded Scene collection. A mismatch triggers rollback. The module never updates Walls, Lights, Tiles, Notes, Sounds, Drawings, or Regions.

Exact positions and discovered placements share the same occupancy set. Unless `allowStack` or `stackWith` is declared, a planned Token cannot overlap an existing Token or an earlier planned Token.

For v14, background identity is read from native Level documents, not the view-dependent legacy Scene background shim. A single-level imported map retains the dataset elevations; multi-level maps require one unambiguous elevation range or an explicit manual anchor level. Native level IDs are written on Tokens, overlap checks ignore Tokens on other known levels, and clicking an encounter views its native level before panning. Plans retain a Level configuration signature; changed levels block creation/rebuild before any mutation. Level documents are included in token-only safety fingerprints. Structural map checks remain enforced; arbitrary remapped or merged maps are not inferred. See [compatibility details](FOUNDRY-V14.md).

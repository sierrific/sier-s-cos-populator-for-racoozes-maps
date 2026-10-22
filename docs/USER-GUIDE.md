# User guide

1. Open any supported Racooze Scene and open the Populator from Token controls or Module Settings. The matching location and Scene part are selected automatically.
2. Review Scene status, Actors, anchors, hidden conditional encounters, and any skipped instances. A structural Scene mismatch blocks persistent actions.
3. Use **Import unambiguous matches into the World** or **Open Plutonium creature importer** if required static Actors are absent.
4. Use **Preview without saving**. Nothing is persisted by preview.
5. Confirm **Create missing** only after the hidden placements look correct.

Populate is idempotent. Reconcile removes obsolete module-owned Tokens and creates missing ones. Remove and rebuild never target unflagged or malformed-flag Tokens. Conditional, dormant, summoned, and itinerant entries are created hidden and carry an encounter warning; reveal or move them only when the described trigger occurs.

The automatic importer never deletes Actors. Managed duplicates are preserved and reported for GM review. Optional concise diagnostic logging can be enabled under Foundry's module settings.

On v14, preview shows placements on the currently viewed native Scene Level. Clicking an encounter views its level before panning. If review reports `native-level-ambiguous`, `native-level-unresolved`, or `native-level-missing`, verify the Scene's elevation ranges or mark the area's manual anchor while viewing the intended level, then refresh. Structural Scene fingerprint mismatches still require map review; the module does not automatically convert or merge maps. See [v14 testing status](FOUNDRY-V14.md).

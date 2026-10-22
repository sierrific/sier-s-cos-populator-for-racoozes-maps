import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.foundry = { utils: { lineSegmentIntersects: () => false } };
const { actorSpecs, normalizeActorName, resolveActorSpec } = await import("../racooze-cos-populator/scripts/actor-resolver.js");
const { expectedPopulationKeys, planPopulation } = await import("../racooze-cos-populator/scripts/placement-engine.js");
const { validateLocationData, fingerprintScene, verifyTokenOnlyMutation } = await import("../racooze-cos-populator/scripts/validation.js");
const { scopeLocationData, sceneCanvasBounds, scoreScene, expectedCanvasBounds, sceneDefinitions } = await import("../racooze-cos-populator/scripts/scene-resolver.js");
const { encounterFocusPoint } = await import("../racooze-cos-populator/scripts/encounter-navigation.js");
const { makeTokenFlag, getPopulationFlag, isModuleToken, populationKey } = await import("../racooze-cos-populator/scripts/flags.js");
const { resolveAnchors } = await import("../racooze-cos-populator/scripts/anchor-resolver.js");
const { populateMissing, removeCreated } = await import("../racooze-cos-populator/scripts/populator.js");
const { isManagedImport } = await import("../racooze-cos-populator/scripts/actor-importer.js");

const data = JSON.parse(fs.readFileSync("racooze-cos-populator/data/locations/death-house.json", "utf8"));
const campaignIndex = JSON.parse(fs.readFileSync("racooze-cos-populator/data/campaign-index.json", "utf8"));
const sceneFingerprints = JSON.parse(fs.readFileSync("racooze-cos-populator/data/scene-fingerprints.json", "utf8"));
assert.equal(Object.keys(sceneFingerprints.scenes).length, 36);
let totalScenes = 0; let totalEncounters = 0; let totalTokenInstances = 0; let plannedSceneVariants = 0;
for (const entry of campaignIndex.locations) {
  const location = JSON.parse(fs.readFileSync(`racooze-cos-populator/data/${entry.file}`, "utf8"));
  location.scenes = location.scenes.map((scene) => ({ ...scene, fingerprint: sceneFingerprints.scenes[scene.sourceSceneId] }));
  const validation = validateLocationData(location);
  assert.deepEqual(validation.errors, [], `${entry.key} failed runtime data validation`);
  assert.deepEqual(validation.warnings, [], `${entry.key} has unexpected data warnings`);
  totalScenes += sceneDefinitions(location).length; totalEncounters += location.encounters.length;
  totalTokenInstances += location.encounters.reduce((sum, encounter) => sum + encounter.tokens.reduce((tokenSum, token) => tokenSum + token.count, 0), 0);
  for (const definition of sceneDefinitions(location)) {
    const part = scopeLocationData(location, definition.key);
    const partActors = new Map([...actorSpecs(part).keys()].map((key) => [key, { status: "resolved", document: { prototypeToken: { width: 1, height: 1 } } }]));
    const partAnchors = new Map(Object.entries(part.anchors).map(([area, anchor]) => [area, { status: "resolved", area, ...anchor }]));
    const bounds = expectedCanvasBounds(definition);
    const partScene = { id: `${entry.key}-${definition.key}`, width: definition.width, height: definition.height, dimensions: bounds, padding: definition.padding ?? 0, grid: { size: definition.grid }, tokens: [], walls: [] };
    const partPlan = planPopulation(partScene, part, partActors, partAnchors);
    assert.equal(partPlan.placements.length, expectedPopulationKeys(part).size, `${entry.key}/${definition.key} cannot place every automatic Token`);
    plannedSceneVariants += 1;
  }
}
assert.equal(totalScenes, 36); assert.equal(totalEncounters, 226); assert.equal(totalTokenInstances, 834); assert.equal(plannedSceneVariants, 36);
assert.equal(validateLocationData(data).ok, true); assert.equal(normalizeActorName("Shambling—Mound"), "shambling mound");
const scoped = scopeLocationData(data, "main"); assert.equal(scoped.encounters.length, 8); assert.equal(expectedPopulationKeys(scoped).size, 16);
const actors = new Map([...actorSpecs(scoped).keys()].map((key) => [key, { status: "resolved", document: { prototypeToken: { width: 1, height: 1 } } }]));
const anchors = new Map(Object.entries(scoped.anchors).map(([area, anchor]) => [area, { status: "resolved", area, ...anchor }]));
const scene = { id: "death-house", width: 7800, height: 8000, padding: 0.25, grid: { size: 200 }, tokens: [], walls: [] };
assert.deepEqual(sceneCanvasBounds(scene), { width: 11700, height: 12000 });
const plan = planPopulation(scene, scoped, actors, anchors); assert.equal(plan.placements.length, 16); assert.equal(plan.warnings.length, 8); assert.equal(plan.warnings.filter((item) => item.humanReview).length, 8); assert.equal(new Set(plan.placements.map((item) => item.key)).size, 16);
const populatedScene = { ...scene, tokens: plan.placements.map((placement, index) => ({ id: `existing-${index}`, x: placement.x, y: placement.y, width: placement.width, height: placement.height, flags: { "racooze-cos-populator": placement.flag } })) };
const secondPlan = planPopulation(populatedScene, scoped, actors, anchors); assert.equal(secondPlan.placements.length, 0); assert.equal(secondPlan.skipped.filter((item) => item.reason === "already-present").length, 16);
assert(scoped.encounters.filter((encounter) => encounter.mode === "conditional").every((encounter) => encounter.warningCode && encounter.tokens.every((token) => token.hidden === true)));
const noMimicAnchor = new Map(anchors); noMimicAnchor.set("area-33", { status: "unresolved", area: "area-33" }); const guarded = planPopulation(scene, scoped, actors, noMimicAnchor); assert.equal(guarded.placements.length, 15); assert(guarded.skipped.some((item) => item.encounterId === "dh-33-mimic" && item.reason === "anchor-unresolved"));
const sourceScene = { name: "Death House", width: 7800, height: 8000, padding: 0.25, grid: { size: 200 }, flags: { "scene-packer": { sourceId: "Compendium.racoozes-cos-maps.racoozes-CoS-maps.Scene.GoLWbXCl0JWgP5sZ", "source-module": "racoozes-cos-maps" } } };
assert(scoreScene(sourceScene, data.scenes[0]).valid); assert(scoreScene({ ...sourceScene, name: "Map 3.1: Village of Barovia", flags: {} }, data.scenes[0]).score < 70);
const fingerprintedDefinition = { ...data.scenes[0], fingerprint: sceneFingerprints.scenes[data.scenes[0].sourceSceneId] };
const fingerprintedScene = { ...sourceScene, walls: Array.from({ length: 530 }), lights: [], notes: [], tiles: Array.from({ length: 11 }), drawings: [] };
assert(scoreScene(fingerprintedScene, fingerprintedDefinition).valid); assert.equal(scoreScene({ ...fingerprintedScene, walls: Array.from({ length: 529 }) }, fingerprintedDefinition).valid, false);
const wrongRacoozeScene = { ...sourceScene, name: "Tser Pool Encampment", flags: { "scene-packer": { sourceId: "Compendium.racoozes-cos-maps.racoozes-CoS-maps.Scene.0RQCWFCjeVaJV1Gn", "source-module": "racoozes-cos-maps" } } };
assert.equal(scoreScene(wrongRacoozeScene, data.scenes[0]).valid, false, "shared Racooze provenance must not identify the wrong location");
const before = { tokens: ["a"], tokenSnapshots: [{ id: "a", data: { _id: "a", x: 0 } }], walls: [], lights: [], tiles: [], notes: [], sounds: [], drawings: [], regions: [] }; const after = { ...before, tokens: ["a", "b"], tokenSnapshots: [...before.tokenSnapshots, { id: "b", data: { _id: "b", x: 0 } }] }; assert.equal(verifyTokenOnlyMutation(before, after, { created: ["b"] }).ok, true); assert.equal(verifyTokenOnlyMutation(before, { ...before, walls: [{ id: "w" }] }).ok, false);
const wallA = { id: "w", toObject: () => ({ _id: "w", c: [0, 0, 200, 0] }) }; const wallB = { id: "w", toObject: () => ({ _id: "w", c: [0, 0, 400, 0] }) }; assert.equal(verifyTokenOnlyMutation(fingerprintScene({ id: "s", tokens: [], walls: [wallA] }), fingerprintScene({ id: "s", tokens: [], walls: [wallB] })).ok, false);
assert.equal(verifyTokenOnlyMutation(fingerprintScene({ id: "s", width: 1000, height: 1000, grid: { size: 100 }, tokens: [] }), fingerprintScene({ id: "s", width: 1200, height: 1000, grid: { size: 100 }, tokens: [] })).ok, false);
const navScene = { grid: { size: 200 }, tokens: [{ x: 800, y: 1000, width: 1, height: 1, flags: { "racooze-cos-populator": { campaign: "cos", schemaVersion: 1, locationKey: "death-house", sceneKey: "main", area: "area-28", encounterId: "dh-28-grick", actorKey: "grick", instance: 1 } } }] }; assert.deepEqual(encounterFocusPoint({ scene: navScene, locationKey: "death-house", sceneKey: "main", encounter: { id: "dh-28-grick" } }), { x: 900, y: 1100 });
const castle = JSON.parse(fs.readFileSync("racooze-cos-populator/data/locations/castle-ravenloft.json", "utf8"));
const castleComposite = scopeLocationData(castle, "composite");
assert.equal(castleComposite.encounters.length, castle.encounters.length);
assert(castleComposite.encounters.every((encounter) => encounter.sceneKey === "composite" && encounter.id.endsWith("-composite")));
assert(Object.values(castleComposite.anchors).every((anchor) => anchor.sceneKey === "composite"));
const validFlag = makeTokenFlag({ locationKey: "death-house", sceneKey: "main", area: "area-28", encounterId: "dh-28-grick", actorKey: "grick", instance: 1 });
assert(populationKey(validFlag)); assert(isModuleToken({ flags: { "racooze-cos-populator": validFlag } }));
assert.equal(getPopulationFlag({ flags: { "racooze-cos-populator": { ...validFlag, campaign: "dotmm" } } }), null);
assert.equal(populationKey({ ...validFlag, instance: 0 }), null);
const collisionData = { schemaVersion: 1, campaignKey: "cos", locationKey: "collision-test", scenes: [{ key: "main", sourceSceneId: "source", names: ["Collision Test"], width: 1000, height: 1000, grid: 100, padding: 0 }], anchors: { room: { sceneKey: "main", x: 200, y: 200, verified: true } }, encounters: [{ id: "collision", sceneKey: "main", area: "room", mode: "static", tokens: [{ actorKey: "first", actor: "First", count: 1, positions: [{ x: 100, y: 100 }] }, { actorKey: "second", actor: "Second", count: 1, positions: [{ x: 100, y: 100 }] }] }] };
assert(validateLocationData(collisionData).errors.some((message) => message.includes("Overlapping exact positions")));
const collisionActors = new Map([["first", { status: "resolved", document: { prototypeToken: { width: 1, height: 1 } } }], ["second", { status: "resolved", document: { prototypeToken: { width: 1, height: 1 } } }]]);
const collisionPlan = planPopulation({ id: "collision", width: 1000, height: 1000, padding: 0, grid: { size: 100 }, tokens: [], walls: [] }, { ...collisionData, scene: collisionData.scenes[0], activeSceneKey: "main" }, collisionActors, new Map([["room", { status: "resolved", area: "room", x: 200, y: 200 }]]));
assert.equal(collisionPlan.placements.length, 1); assert(collisionPlan.skipped.some((item) => item.reason === "exact-position-unavailable"));
const importFolder = { id: "imports" };
assert(isManagedImport({ folder: importFolder, flags: { "racooze-cos-populator": { importedActor: { sourceUuid: "Compendium.test.Actor.one" } } } }, importFolder));
assert.equal(isManagedImport({ folder: { id: "elsewhere" }, flags: { "racooze-cos-populator": { importedActor: { sourceUuid: "Compendium.test.Actor.one" } } } }, importFolder), false);
globalThis.game = { settings: { get: () => ({ "Scene.manual": { room: { x: 420, y: 490 } } }) } };
const manualScene = { id: "manual", uuid: "Scene.manual", width: 700, height: 700, grid: { size: 70 }, notes: [], drawings: [], regions: [], tiles: [] };
const manualData = { scene: { width: 700, height: 700, grid: 70, padding: 0 }, anchors: { room: { x: 350, y: 350, verified: true } }, encounters: [{ area: "room" }] };
assert.deepEqual(resolveAnchors(manualScene, manualData).get("room"), { status: "resolved", area: "room", x: 420, y: 490, source: "manual" });
globalThis.game = { settings: { get: (_module, key) => key === "actorOverrides" ? {} : "" }, actors: [{ id: "a", uuid: "Actor.a", name: "Ghoul", flags: {}, system: {} }, { id: "b", uuid: "Actor.b", name: "Ghoul", flags: {}, system: {} }], packs: [] };
assert.equal((await resolveActorSpec({ actorKey: "ghoul", actor: "Ghoul", aliases: [], sourcePreference: [] })).status, "ambiguous");
globalThis.game = { user: { isGM: true } };
const rollbackScene = {
  id: "partial-create", tokens: [], walls: [], lights: [], tiles: [], notes: [], sounds: [], drawings: [], regions: [],
  async createEmbeddedDocuments(_type, rows) {
    const created = rows.map((row, index) => ({ ...row, id: row._id ?? `created-${index + 1}`, parent: rollbackScene, toObject() { return { ...row, _id: this.id }; } }));
    this.tokens.push(...created);
    if (!rows.some((row) => row._id)) throw new Error("simulated partial create");
    return created;
  },
  async deleteEmbeddedDocuments(_type, ids) { this.tokens = this.tokens.filter((token) => !ids.includes(token.id)); }
};
const rollbackPlan = { placements: [{ x: 0, y: 0, elevation: 0, spec: {}, flag: makeTokenFlag({ locationKey: "death-house", sceneKey: "main", area: "area-28", encounterId: "dh-28-grick", actorKey: "grick", instance: 1 }), actor: { async getTokenDocument() { return { toObject: () => ({ name: "Grick", width: 1, height: 1 }) }; } } }] };
await assert.rejects(populateMissing(rollbackScene, rollbackPlan), /Partial changes were rolled back/);
assert.equal(rollbackScene.tokens.length, 0);
const ownedFlag = makeTokenFlag({ locationKey: "death-house", sceneKey: "main", area: "area-28", encounterId: "dh-28-grick", actorKey: "grick", instance: 1 });
const removalScene = { id: "safe-removal", tokens: [], walls: [], lights: [], tiles: [], notes: [], sounds: [], drawings: [], regions: [], async deleteEmbeddedDocuments(_type, ids) { this.tokens = this.tokens.filter((token) => !ids.includes(token.id)); } };
const tokenDocument = (id, flags) => ({ id, parent: removalScene, flags, toObject() { return { _id: id, flags }; } });
removalScene.tokens = [tokenDocument("owned", { "racooze-cos-populator": ownedFlag }), tokenDocument("external", {}), tokenDocument("malformed", { "racooze-cos-populator": { ...ownedFlag, campaign: "dotmm" } })];
const removal = await removeCreated(removalScene, { locationKey: "death-house", sceneKey: "main" });
assert.deepEqual(removal.removed.map((token) => token.id), ["owned"]); assert.deepEqual(removalScene.tokens.map((token) => token.id), ["external", "malformed"]);
console.log(JSON.stringify({ ok: true, locations: campaignIndex.locations.length, scenes: totalScenes, encounters: totalEncounters, dataTokenInstances: totalTokenInstances, plannedSceneVariants, deathHouseAutomaticTokens: plan.placements.length, reviewWarnings: plan.warnings.length, idempotentSecondPlan: true, strictTokenFlags: true, ownershipScopedRemoval: true, explicitCollisionGuard: true, managedActorImports: true, actorAmbiguityGuard: true, manualAnchorOverride: true, partialCreateRollback: true, geometryGuard: true, racoozeSceneFingerprint: true, compositeCastleTransform: true, sceneConfigurationFingerprint: true, tokenOnlyFingerprint: true }, null, 2));

import assert from "node:assert/strict";
import fs from "node:fs";

// API-contract regression fixtures, not a replacement for a licensed Foundry
// browser smoke test. V14 intentionally has none of the former global classes.
const generation = Number(process.argv[2] ?? 14);
const ID = "racooze-cos-populator";
const hooks = new Map();
const hookApi = { once: (name, fn) => hooks.set(name, fn), on: (name, fn) => hooks.set(name, fn) };
const settings = new Map();
const menus = [];
const actor = { documentName: "Actor", id: "actor", uuid: "Actor.actor", name: "Test", prototypeToken: { width: 1, height: 1 } };
let requestedTokenData; let requestedParent;
actor.getTokenDocument = async (data, options) => {
  requestedParent = options.parent;
  requestedTokenData = data;
  return { toObject: () => ({ _id: "prototype", actorId: actor.id, width: 1, height: 1, flags: {}, ...data }) };
};
class FormBase {
  static get defaultOptions() { return {}; }
  constructor() { this.options = this.constructor.defaultOptions; }
  render() { this.rendered = true; return this; }
  async close() { this.rendered = false; }
}
let confirmation = true;
let dialogOptions;
const dialogApi = { confirm: async (options) => { dialogOptions = options; return confirmation; } };
class ActorClass {}
class FolderClass {}
class SceneClass {}
globalThis.CONFIG = { Actor: { documentClass: ActorClass }, Folder: { documentClass: FolderClass }, Scene: { documentClass: SceneClass } };
globalThis.foundry = {
  utils: { deepClone: structuredClone, mergeObject: (a, b) => ({ ...a, ...b }), lineSegmentIntersects: () => false },
  applications: { api: {} }
};
if (generation >= 13) {
  foundry.appv1 = { api: { FormApplication: FormBase } };
  foundry.helpers = { Hooks: hookApi };
  foundry.utils.fromUuid = async () => actor;
  foundry.applications.api.DialogV2 = dialogApi;
} else {
  globalThis.FormApplication = FormBase;
  globalThis.Hooks = hookApi;
  globalThis.fromUuid = async () => actor;
  globalThis.Dialog = dialogApi;
}
globalThis.game = {
  release: { generation }, system: { id: "dnd5e", version: "fixture" }, user: { isGM: true },
  settings: {
    get: (_module, key) => settings.get(key), set: async (_module, key, value) => settings.set(key, value),
    register: (_module, key, config) => settings.set(key, config.default), registerMenu: (_module, _key, config) => menus.push(config)
  },
  actors: [actor], packs: [], scenes: { contents: [] },
  modules: new Map([[ID, {}], ["racoozes-cos-maps", { active: true, version: "1.0.7" }]])
};
globalThis.ui = { notifications: { info() {}, error() {} } };
globalThis.canvas = { ready: true, scene: null };
globalThis.window = new EventTarget();

const compat = await import("../racooze-cos-populator/scripts/compatibility.js");
const { validateEnvironment, fingerprintScene, verifyTokenOnlyMutation } = await import("../racooze-cos-populator/scripts/validation.js");
const { planPopulation } = await import("../racooze-cos-populator/scripts/placement-engine.js");
const { populateMissing, reconcile, rebuild, removeCreated } = await import("../racooze-cos-populator/scripts/populator.js");
const { resolveActorSpec } = await import("../racooze-cos-populator/scripts/actor-resolver.js");
const { scoreScene, scopeLocationData } = await import("../racooze-cos-populator/scripts/scene-resolver.js");
const { actorSpecs } = await import("../racooze-cos-populator/scripts/actor-resolver.js");
const { RacoozeCosPopulatorApp, drawPreview, clearPreview } = await import("../racooze-cos-populator/scripts/ui.js");
const { authorAnchor, cancelAnchorAuthoring } = await import("../racooze-cos-populator/scripts/anchor-authoring.js");
const { panToEncounter } = await import("../racooze-cos-populator/scripts/encounter-navigation.js");
await import("../racooze-cos-populator/scripts/main.js");
hooks.get("init")(); hooks.get("ready")();
assert.equal(menus[0].type, RacoozeCosPopulatorApp);
assert(new RacoozeCosPopulatorApp() instanceof FormBase);
assert.deepEqual(RacoozeCosPopulatorApp.defaultOptions.tabs, [{ navSelector: ".tabs", contentSelector: ".content", initial: "review" }]);
assert.equal(game.modules.get(ID).api.open().rendered, true);
assert.equal(validateEnvironment().ok, true);
for (const unsupported of [11, 15]) { game.release.generation = unsupported; assert.equal(validateEnvironment().ok, false); }
game.release.generation = generation;
const controls = generation === 12 ? [{ name: "token", tools: [] }] : { tokens: { tools: { select: { order: 2 } } } };
hooks.get("getSceneControlButtons")(controls);
hooks.get("getSceneControlButtons")(controls);
const tools = generation === 12 ? controls[0].tools : Object.values(controls.tokens.tools);
assert.equal(tools.filter((entry) => entry.name === `${ID}-open`).length, 1);
const openTool = tools.find((entry) => entry.name === `${ID}-open`);
assert.equal((generation === 12 ? openTool.onClick() : openTool.onChange({}, true)).rendered, true);
game.user.isGM = false;
const playerControls = generation === 12 ? [{ name: "token", tools: [] }] : { tokens: { tools: {} } };
hooks.get("getSceneControlButtons")(playerControls);
assert.equal((generation === 12 ? playerControls[0].tools : Object.values(playerControls.tokens.tools)).length, 0);
assert.throws(() => game.modules.get(ID).api.open(), /GM-only/);
game.user.isGM = true;
assert.equal(compat.documentClass("Actor"), ActorClass);
assert.equal(compat.documentClass("Folder"), FolderClass);
assert.equal(compat.documentClass("Scene"), SceneClass);
assert.equal((await resolveActorSpec({ actorKey: "test", actor: "Test" }, { overrides: { test: "Actor.actor" } })).document, actor);
assert.equal(await compat.confirmAction("Confirm", "Proceed?"), true);
if (generation >= 13) { assert.equal(dialogOptions.window.title, "Confirm"); assert.equal(dialogOptions.no.default, true); assert.equal(dialogOptions.rejectClose, false); }
else assert.equal(dialogOptions.defaultYes, false);
confirmation = null; assert.equal(await compat.confirmAction("Confirm", "Proceed?"), false);

const makeLevel = (id, bottom, top) => ({ id, _id: id, background: { src: "map.webp" }, elevation: { bottom, top }, toObject() { return { _id: this.id, background: this.background, elevation: this.elevation }; } });
const scene = {
  id: "test", uuid: "Scene.test", width: 1000, height: 1000, padding: 0, grid: { size: 100 }, tokens: [],
  walls: [], lights: [], drawings: [], notes: [], tiles: [], regions: [], sounds: [],
  ...(generation === 14 ? { levels: [makeLevel("ground", 0, 10), makeLevel("upper", 10, 20)] } : {}),
  async createEmbeddedDocuments(type, data) {
    assert.equal(type, "Token");
    const created = data.map((entry, i) => ({ ...structuredClone(entry), id: `t${this.tokens.length + i}`, parent: this, toObject() { const { parent, toObject, ...source } = this; return source; } }));
    this.tokens.push(...created); return created;
  },
  async deleteEmbeddedDocuments(type, ids) { assert.equal(type, "Token"); this.tokens = this.tokens.filter((token) => !ids.includes(token.id)); },
  async view(options) { this.lastView = options; canvas.scene = this; canvas.level = this.levels?.find((level) => level.id === options.level); }
};
canvas.scene = scene; canvas.level = scene.levels?.[0];
const spec = { actorKey: "test", actor: "Test", count: 1, hidden: true, positions: [{ x: 200, y: 200, width: 2, height: 1, elevation: 10 }] };
const encounter = { id: "test-encounter", area: "test", tokens: [spec] };
const data = { locationKey: "test", activeSceneKey: "main", encounters: [encounter] };
const actors = new Map([["test", { status: "resolved", document: actor }]]);
const anchors = new Map([["test", { status: "resolved", x: 250, y: 250 }]]);
if (generation === 14) scene.tokens.push({ id: "external", x: 200, y: 200, width: 2, height: 1, level: "ground", toObject: () => ({ _id: "external" }) });
const plan = planPopulation(scene, data, actors, anchors);
assert.equal(plan.placements.length, 1);
assert.equal(plan.placements[0].level, generation === 14 ? "upper" : null);
const created = await populateMissing(scene, plan);
assert.equal(created.created.length, 1);
assert.equal(created.verification.ok, true);
assert.equal(created.created[0].width, 2);
assert.equal(created.created[0].hidden, true);
assert.equal(created.created[0].elevation, 10);
assert.equal(requestedTokenData.level, generation === 14 ? "upper" : undefined);
assert.equal(requestedParent, scene);
assert.equal(planPopulation(scene, data, actors, anchors).placements.length, 0);

let pans = 0;
canvas.animatePan = async () => { pans += 1; };
await panToEncounter({ scene, locationKey: "test", sceneKey: "main", encounter, plan });
assert.equal(pans, 1);
if (generation === 14) assert.deepEqual(scene.lastView, { level: "upper" });

if (generation === 14) {
  const before = fingerprintScene(scene);
  scene.levels[1].background.src = "changed.webp";
  assert.equal(verifyTokenOnlyMutation(before, fingerprintScene(scene)).ok, false);
  for (const operation of [populateMissing, reconcile, rebuild]) await assert.rejects(() => operation(scene, plan), /Levels changed/);
  scene.levels[1].background.src = "map.webp";
  assert.equal(compat.resolveSceneLevel(scene, 10), "upper");
  assert.throws(() => compat.resolveSceneLevel(scene, 25), /unresolved/);
  scene.levels[1].elevation.bottom = 0;
  assert.throws(() => compat.resolveSceneLevel(scene, 5), /ambiguous/);
  scene.levels[0].elevation.top = 20;
  const ambiguous = planPopulation({ ...scene, tokens: [] }, data, actors, anchors);
  assert.equal(ambiguous.placements.length, 0);
  await assert.rejects(() => populateMissing(scene, ambiguous), /ambiguous or missing/);
  scene.levels[0].elevation.top = 10; scene.levels[1].elevation.bottom = 10;
  assert.equal(compat.resolveSceneLevel(scene, 99, "ground"), "ground");
  assert.throws(() => compat.resolveSceneLevel(scene, 10, "deleted"), /missing/);
  const single = { ...scene, levels: [scene.levels[0]] };
  assert.equal(compat.resolveSceneLevel(single, -30), "ground");
  const occupied = { ...scene, tokens: [{ id: "other", x: 200, y: 200, width: 2, height: 1, level: "upper" }] };
  assert.equal(planPopulation(occupied, data, actors, anchors).placements.length, 0, "Same-level Tokens still block overlap");
  const stackedData = { ...data, encounters: [{ ...encounter, tokens: [spec, { actorKey: "guest", actor: "Guest", count: 1, stackWith: "test" }] }] };
  const stackedActors = new Map([...actors, ["guest", { status: "resolved", document: actor }]]);
  const upperOnly = { ...scene, tokens: [], levels: [makeLevel("upper", 10, 20), makeLevel("roof", 20, 30)] };
  const stack = planPopulation(upperOnly, stackedData, stackedActors, anchors);
  assert.equal(stack.placements.length, 2);
  assert.equal(stack.placements[1].level, "upper");
  assert.equal(stack.placements[1].elevation, 10);
  const backgroundOnly = { ...single, name: "Renamed", flags: { "racoozes-cos-maps": {} }, get background() { throw new Error("Deprecated scene.background accessed"); } };
  assert.equal(scoreScene(backgroundOnly, { width: 1000, height: 1000, grid: 100, padding: 0, backgroundBasename: "map.webp" }).valid, true);
}
await removeCreated(scene, { locationKey: "test", sceneKey: "main" });
assert.equal(scene.tokens.length, generation === 14 ? 1 : 0);
game.user.isGM = false;
await assert.rejects(() => populateMissing(scene, plan), /GM-only/);
await assert.rejects(() => removeCreated(scene), /GM-only/);
game.user.isGM = true;

// Preview both Graphics API shapes; native level filtering must not draw other floors.
let drawn = 0;
class Container { destroyed = false; addChild() {} destroy() { assert.equal(this.destroyed, false); this.destroyed = true; } }
class GraphicsV7 { lineStyle() {} beginFill() {} drawRect() { drawn += 1; } endFill() {} }
class GraphicsV8 { rect() { drawn += 1; return this; } fill() { return this; } stroke() { return this; } }
const stageListeners = new Map();
canvas.stage = { addChild() {}, eventMode: "auto", on: (name, fn) => stageListeners.set(name, fn), off: (name) => stageListeners.delete(name) };
for (const Graphics of [GraphicsV7, GraphicsV8]) {
  globalThis.PIXI = { Container, Graphics };
  canvas.level = scene.levels?.[0];
  assert.equal(drawPreview(scene, plan), generation === 14 ? 0 : 1);
  if (generation === 14) { canvas.level = scene.levels[1]; assert.equal(drawPreview(scene, plan), 1); }
  clearPreview(); clearPreview();
}
assert.equal(drawn, 2);
const cancelled = authorAnchor(scene, "test");
const rejected = assert.rejects(cancelled, /cancelled/);
hooks.get("canvasTearDown")(); await rejected;
assert.equal(stageListeners.size, 0); assert.equal(canvas.stage.eventMode, "auto");
const authored = authorAnchor(scene, "test");
await stageListeners.get("pointerdown")({ getLocalPosition: () => ({ x: 250, y: 250 }) });
assert.equal((await authored).level, generation === 14 ? "upper" : undefined);
cancelAnchorAuthoring();

let migratedSceneVariants = 0;
if (generation === 14) {
  const index = JSON.parse(fs.readFileSync("racooze-cos-populator/data/campaign-index.json", "utf8"));
  for (const entry of index.locations) {
    const location = JSON.parse(fs.readFileSync(`racooze-cos-populator/data/${entry.file}`, "utf8"));
    for (const definition of location.scenes) {
      const scoped = scopeLocationData(location, definition.key);
      const migrated = { ...scene, tokens: [], width: definition.width, height: definition.height, padding: definition.padding ?? 0, grid: { size: definition.grid }, dimensions: { width: definition.canvasWidth, height: definition.canvasHeight }, levels: [makeLevel("migrated", 0, null)] };
      const resolved = new Map([...actorSpecs(scoped).keys()].map((key) => [key, { status: "resolved", document: actor }]));
      const fallback = new Map(Object.entries(scoped.anchors).map(([area, anchor]) => [area, { status: "resolved", ...anchor }]));
      const migratedPlan = planPopulation(migrated, scoped, resolved, fallback);
      assert.equal(migratedPlan.placements.length, migratedPlan.expectedKeys.size, `${entry.key}/${definition.key}`);
      assert(migratedPlan.placements.every((placement) => placement.level === "migrated"));
      migratedSceneVariants += 1;
    }
  }
  assert.equal(migratedSceneVariants, 36);
}
console.log(JSON.stringify({ ok: true, generation, checks: ["module bootstrap", "same UI tabs", "GM-only controls", "namespaced APIs", "safe confirmations", "Token create/remove/idempotency", "placement dimensions", "level-aware navigation/preview", "anchor teardown"], migratedSceneVariants, runtime: "mocked API contracts, not a Foundry browser" }));

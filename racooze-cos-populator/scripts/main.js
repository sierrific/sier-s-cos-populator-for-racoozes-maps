import { MODULE_ID, SETTINGS } from "./constants.js";
import { RacoozeCosPopulatorApp, openPopulator, clearPreview } from "./ui.js";
import { loadCampaignIndex, loadLocationData, loadAllLocations, clearDataCache } from "./data-loader.js";
import { resolveLocationScene, scoreLocationScene, scopeLocationData } from "./scene-resolver.js";
import { resolveActors } from "./actor-resolver.js";
import { resolveAnchors } from "./anchor-resolver.js";
import { planPopulation } from "./placement-engine.js";
import { populateMissing, reconcile, removeCreated, rebuild } from "./populator.js";
import { createMissingSafetyCopies, safetyCopyStatus } from "./safety-copies.js";
import { importAvailableActors } from "./actor-importer.js";
import { addSceneControl } from "./compatibility.js";
import { cancelAnchorAuthoring } from "./anchor-authoring.js";

const Hooks = foundry.helpers?.Hooks ?? globalThis.Hooks;

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.preferredPacks, { name: "Preferred Actor compendiums", hint: "Comma-separated pack IDs checked before dnd5e.monsters.", scope: "world", config: false, type: String, default: "" });
  game.settings.register(MODULE_ID, SETTINGS.actorOverrides, { name: "Actor UUID overrides", scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SETTINGS.manualAnchors, { name: "Manual placement anchors", scope: "world", config: false, type: Object, default: {} });
  game.settings.register(MODULE_ID, SETTINGS.selectedLocation, { name: "Selected campaign location", scope: "client", config: false, type: String, default: "death-house" });
  game.settings.register(MODULE_ID, SETTINGS.debug, { name: "Debug logging", hint: "Log concise Scene, Actor, anchor, preview, and mutation summaries to the browser console.", scope: "world", config: true, type: Boolean, default: false });
  game.settings.registerMenu(MODULE_ID, "controlPanel", { name: "Sier's CoS Populator for Racooze's Maps", label: "Open Encounter Review", hint: "Review Scene matching, Actors, anchors, and deterministic placement before creating Tokens.", icon: "fas fa-users-viewfinder", type: RacoozeCosPopulatorApp, restricted: true });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = { open: openPopulator, loadCampaignIndex, loadLocationData, loadAllLocations, clearDataCache, resolveLocationScene, scoreLocationScene, scopeLocationData, resolveActors, resolveAnchors, planPopulation, populateMissing, reconcile, removeCreated, rebuild, createMissingSafetyCopies, safetyCopyStatus, importAvailableActors };
  console.info(`${MODULE_ID} | Ready. GM review is required before population.`);
});

Hooks.on("getSceneControlButtons", (controls) => {
  addSceneControl(controls, () => openPopulator());
});
Hooks.on("canvasTearDown", () => { clearPreview(); cancelAnchorAuthoring(); });

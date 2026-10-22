import { MODULE_ID, SETTINGS } from "./constants.js";
import { loadCampaignIndex, loadAllLocations, clearDataCache } from "./data-loader.js";
import { validateEnvironment, validateLocationData, assertGm } from "./validation.js";
import { resolveLocationScene, scoreLocationScene, scopeLocationData } from "./scene-resolver.js";
import { resolveActors, actorResolutionSummary, actorSpecs } from "./actor-resolver.js";
import { resolveAnchors, normalizeAreaId } from "./anchor-resolver.js";
import { planPopulation } from "./placement-engine.js";
import { populateMissing, removeCreated, reconcile, rebuild, moduleTokenCounts } from "./populator.js";
import { authorAnchor, cancelAnchorAuthoring } from "./anchor-authoring.js";
import { openPlutoniumCreatureImporter, plutoniumStatus } from "./plutonium-helper.js";
import { createMissingSafetyCopies } from "./safety-copies.js";
import { importAvailableActors } from "./actor-importer.js";
import { panToEncounter } from "./encounter-navigation.js";
import { debugLog } from "./logger.js";
import { confirmAction, levelId } from "./compatibility.js";

// Preserve the DotMM-style template and tabs using Foundry's v14 V1 namespace.
const PopulatorFormApplication = foundry.appv1?.api?.FormApplication ?? globalThis.FormApplication;

let previewContainer = null;
export function clearPreview() { if (!previewContainer?.destroyed) previewContainer?.destroy?.({ children: true }); previewContainer = null; }
export function drawPreview(scene, plan) {
  clearPreview();
  if (!canvas?.ready || canvas.scene?.id !== scene.id) throw new Error("Activate the target Scene to preview placement.");
  const layer = new PIXI.Container(); layer.name = `${MODULE_ID}-preview`; layer.eventMode = "none";
  const viewedLevel = levelId(canvas.level);
  let count = 0;
  for (const placement of plan.placements) {
    if (placement.level && viewedLevel && placement.level !== viewedLevel) continue;
    const graphic = new PIXI.Graphics();
    if (typeof graphic.rect === "function" && typeof graphic.fill === "function") {
      graphic.rect(placement.x, placement.y, placement.rect.width, placement.rect.height).fill({ color: 0x45d483, alpha: 0.18 }).stroke({ width: 3, color: 0x45d483, alpha: 0.95 });
    } else {
      graphic.lineStyle(3, 0x45d483, 0.95); graphic.beginFill(0x45d483, 0.18); graphic.drawRect(placement.x, placement.y, placement.rect.width, placement.rect.height); graphic.endFill();
    }
    layer.addChild(graphic); count += 1;
  }
  canvas.stage.addChild(layer); previewContainer = layer;
  return count;
}
function displayStatus(result) { ui.notifications.info(`Sier's CoS Populator: ${result?.created?.length ?? 0} created, ${result?.removed?.length ?? 0} removed.`); }
function autoEncounter(encounter) { return encounter.autoPopulate !== false; }

export class RacoozeCosPopulatorApp extends PopulatorFormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, { id: `${MODULE_ID}-app`, title: "Sier's CoS Populator for Racooze's Maps", template: `modules/${MODULE_ID}/templates/populator.hbs`, width: 860, height: 720, resizable: true, closeOnSubmit: false, submitOnChange: false, tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "review" }] });
  }
  async _selectedLocationData() {
    const [index, locations] = await Promise.all([loadCampaignIndex(), loadAllLocations()]);
    const active = canvas?.scene;
    if (active) { const ranked = locations.map((data) => ({ data, ...scoreLocationScene(active, data) })).sort((a, b) => b.score - a.score); if (ranked[0]?.valid && ranked[0].score > (ranked[1]?.score ?? 0)) { this.selectedLocation = ranked[0].data.locationKey; return ranked[0].data; } }
    if (this.selectedLocation) return locations.find((item) => item.locationKey === this.selectedLocation) ?? locations[0];
    const saved = String(game.settings.get(MODULE_ID, SETTINGS.selectedLocation) ?? "");
    this.selectedLocation = index.locations.some((entry) => entry.key === saved) ? saved : index.locations[0]?.key;
    return locations.find((item) => item.locationKey === this.selectedLocation) ?? locations[0];
  }
  async _buildContext() {
    assertGm(); const locationData = await this._selectedLocationData(); this.selectedLocation = locationData.locationKey; this.options.title = `Sier's CoS Populator - ${locationData.title}`;
    const environment = validateEnvironment(); const dataValidation = validateLocationData(locationData); const sceneResolution = resolveLocationScene(locationData);
    if (sceneResolution.status !== "resolved") { debugLog("Scene resolution blocked", { locationKey: locationData.locationKey, status: sceneResolution.status, candidates: sceneResolution.candidates?.length ?? 0 }); return { data: locationData, locationData, environment, dataValidation, sceneResolution, blocked: true }; }
    const data = scopeLocationData(locationData, sceneResolution.definition.key); const scene = sceneResolution.scene; const actors = await resolveActors(data); const anchors = resolveAnchors(scene, data); const plan = planPopulation(scene, data, actors, anchors);
    const requiredEncounters = data.encounters.filter(autoEncounter); const requiredActors = new Set(requiredEncounters.flatMap((encounter) => encounter.tokens.map((token) => token.actorKey))); const requiredAreas = new Set(requiredEncounters.map((encounter) => normalizeAreaId(encounter.area)));
    const actorBlockers = [...actors.entries()].filter(([key, result]) => requiredActors.has(key) && result.status !== "resolved").map(([, result]) => result); const anchorBlockers = [...anchors.entries()].filter(([area, result]) => requiredAreas.has(area) && result.status !== "resolved").map(([, result]) => result);
    const blocked = !environment.ok || !dataValidation.ok || actorBlockers.length > 0 || anchorBlockers.length > 0 || plan.skipped.some((entry) => entry.reason.startsWith("native-level-"));
    debugLog("Population review", { locationKey: data.locationKey, sceneKey: data.activeSceneKey, sceneId: scene.id, actors: actorResolutionSummary(actors), anchorsResolved: anchors.size - anchorBlockers.length, anchorsTotal: anchors.size, planned: plan.placements.length, skipped: plan.skipped.length, warnings: plan.warnings.length, blocked });
    return { data, locationData, environment, dataValidation, sceneResolution, scene, actors, anchors, plan, actorBlockers, anchorBlockers, blocked };
  }
  async getData() {
    this.context = await this._buildContext(); const context = this.context; const index = await loadCampaignIndex(); const overrides = game.settings.get(MODULE_ID, SETTINGS.actorOverrides) ?? {}; const actorRows = [];
    if (context.actors) for (const spec of actorSpecs(context.data).values()) { const result = context.actors.get(spec.actorKey); actorRows.push({ ...spec, status: result.status, match: result.name ?? result.matchedName ?? "-", source: result.pack ?? result.source ?? "-", sourceCode: result.sourceCode ?? "-", uuid: overrides[spec.actorKey] ?? "", candidateCount: result.candidates?.length ?? 0 }); }
    const anchorRows = context.anchors ? [...context.anchors.values()].sort((a, b) => a.area.localeCompare(b.area, undefined, { numeric: true })) : [];
    if (!anchorRows.some((row) => row.area === this.selectedAnchorArea)) this.selectedAnchorArea = anchorRows[0]?.area ?? null; if (!anchorRows.some((row) => row.area === this.selectedRebuildArea)) this.selectedRebuildArea = anchorRows[0]?.area ?? null;
    const encounterRows = (context.data.encounters ?? []).map((encounter) => ({ id: encounter.id, area: encounter.area, total: encounter.tokens.reduce((sum, token) => sum + token.count, 0), autoPopulate: autoEncounter(encounter), conditional: encounter.mode === "conditional", hidden: encounter.tokens.every((token) => token.hidden === true), warningCode: encounter.warningCode ?? "", mode: encounter.mode ?? "static", humanReview: Boolean(encounter.humanReview), anchorStatus: context.anchors?.get(normalizeAreaId(encounter.area))?.status ?? "unresolved" }));
    const scope = context.data?.activeSceneKey ? { locationKey: context.data.locationKey, sceneKey: context.data.activeSceneKey } : {};
    const encounterWarningPrefixes = encounterRows.map((row) => `${row.id} `);
    const anchorWarningPrefixes = anchorRows.map((row) => `Anchor ${row.area} `);
    const dataWarnings = context.scene ? context.dataValidation.warnings.filter((warning) => encounterWarningPrefixes.some((prefix) => warning.startsWith(prefix)) || anchorWarningPrefixes.some((prefix) => warning.startsWith(prefix))) : context.dataValidation.warnings;
    const sceneCandidates = context.sceneResolution.status !== "resolved" ? (context.sceneResolution.candidates ?? []).slice(0, 5).map((item) => `${item.scene?.name ?? "?"} (${item.score}: ${item.reasons?.join("; ") || "no trusted match"})`).join(", ") : "";
    return { ...context, locationTitle: context.data.title, locationStatus: context.data.status, locationOptions: index.locations.map((entry) => ({ ...entry, selected: entry.key === context.data.locationKey })), sceneName: context.scene?.name ?? "-", sceneStatus: context.sceneResolution.status, scenePart: context.sceneResolution.definition?.label ?? "-", sceneCandidates, environmentErrors: context.environment.errors, environmentWarnings: context.environment.warnings, dataErrors: context.dataValidation.errors, dataWarnings, actorRows, actorSummary: context.actors ? actorResolutionSummary(context.actors) : {}, actorTotal: actorRows.length, actorResolved: actorRows.filter((row) => row.status === "resolved").length, anchorRows: anchorRows.map((row) => ({ ...row, anchorSelected: row.area === this.selectedAnchorArea, rebuildSelected: row.area === this.selectedRebuildArea })), anchorTotal: anchorRows.length, anchorResolved: anchorRows.filter((row) => row.status === "resolved").length, encounterRows, unresolvedActorNames: actorRows.filter((row) => row.status !== "resolved").map((row) => row.actor).join(", ") || "none", planCount: context.plan?.placements.length ?? 0, skippedCount: context.plan?.skipped.length ?? 0, planIssues: context.plan?.skipped ?? [], planWarnings: context.plan?.warnings ?? [], moduleCounts: context.scene ? moduleTokenCounts(context.scene, scope) : { total: 0, byArea: {} }, preferredPacks: game.settings.get(MODULE_ID, SETTINGS.preferredPacks) ?? "", plutonium: plutoniumStatus() };
  }
  activateListeners(html) {
    super.activateListeners(html); html.find("[data-action]").on("click", (event) => this._onAction(event)); html.find('[name="selectedLocation"]').on("change", (event) => this._onLocationChange(event)); html.find('[name="anchorArea"]').on("change", (event) => { this.selectedAnchorArea = String(event.currentTarget.value); }); html.find('[name="rebuildArea"]').on("change", (event) => { this.selectedRebuildArea = String(event.currentTarget.value); });
  }
  async _onLocationChange(event) { this.selectedLocation = String(event.currentTarget.value); this.selectedAnchorArea = null; this.selectedRebuildArea = null; await game.settings.set(MODULE_ID, SETTINGS.selectedLocation, this.selectedLocation); await this._refreshContext(); }
  async _refreshContext() { clearPreview(); clearDataCache(); this.context = await this._buildContext(); await this.render(false); }
  async _onAction(event) {
    event.preventDefault(); if (this._actionInFlight) return; this._actionInFlight = true; event.currentTarget.disabled = true; const action = event.currentTarget.dataset.action;
    try {
      if (action === "refresh") return this._refreshContext(); if (action === "save-settings") return this.submit({ preventClose: true }); if (action === "open-plutonium") return openPlutoniumCreatureImporter(); const context = this.context ?? await this._buildContext();
      if (action === "create-safety-copies") { if (!await confirmAction("Create safety copies", `Create only missing copies for ${context.data.title}?`)) return; const result = await createMissingSafetyCopies({ locationKeys: [context.data.locationKey] }); if (result.missingSources.length) throw new Error(`Missing source maps: ${result.missingSources.map((item) => item.name).join(", ")}.`); ui.notifications.info(`Safety copies: ${result.created.length} created, ${result.existing.length} already existed.`); return this._refreshContext(); }
      if (action === "import-available-actors") { if (!await confirmAction("Import Actors", "Import only unambiguous Actor matches into the World? Existing Actors are never deleted.")) return; const result = await importAvailableActors({ locationKeys: [context.data.locationKey] }); ui.notifications.info(`Actors: ${result.created.length} imported, ${result.alreadyResolved.length} already available, ${result.blocked.length} require review, ${result.duplicateImports.length} managed duplicates preserved.`); return this._refreshContext(); }
      if (!context.scene) throw new Error(`No unambiguous Racooze Scene is available for ${context.data.title}.`);
      if (action === "pan-encounter") { const encounter = context.data.encounters.find((item) => item.id === String(event.currentTarget.dataset.encounterId)); if (!encounter) throw new Error("Unknown encounter."); return panToEncounter({ scene: context.scene, locationKey: context.data.locationKey, sceneKey: context.data.activeSceneKey, encounter, plan: context.plan, anchor: context.anchors?.get(normalizeAreaId(encounter.area)) }); }
      if (!context.plan) throw new Error("No placement plan is available."); if (action === "preview") { const count = drawPreview(context.scene, context.plan); return ui.notifications.info(`Preview: ${count} Token(s) on this level, ${context.plan.placements.length} planned in this Scene.`); } if (action === "clear-preview") return clearPreview();
      if (action === "author-anchor") { const area = String(this.element.find('[name="anchorArea"]').val() ?? ""); if (!area) throw new Error("Choose an area."); await authorAnchor(context.scene, area); return this._refreshContext(); }
      if (context.blocked) throw new Error("Resolve every required Actor and static encounter anchor before creating persistent Tokens."); const scope = { locationKey: context.data.locationKey, sceneKey: context.data.activeSceneKey };
      if (action === "populate") { if (context.plan.warnings.some((item) => item.humanReview) && !await confirmAction("Populate reviewed encounters", "This Scene contains hidden, human-review placements for triggers or itinerant appearances. Create the missing flagged Tokens?")) return; displayStatus(await populateMissing(context.scene, context.plan)); }
      if (action === "reconcile") { if (!await confirmAction("Reconcile", "Remove obsolete module-owned Tokens and create missing reviewed Tokens?")) return; displayStatus(await reconcile(context.scene, context.plan, scope)); }
      if (action === "remove") { if (!await confirmAction("Remove Tokens", "Remove only Tokens flagged by this module for this location and Scene?")) return; displayStatus(await removeCreated(context.scene, scope)); }
      if (action === "rebuild-location") { if (!await confirmAction("Rebuild current Scene", "Remove and recreate only Tokens flagged by this module for this location and Scene?")) return; const fresh = planPopulation(context.scene, context.data, context.actors, context.anchors, { ignoreExisting: true }); displayStatus(await rebuild(context.scene, fresh, scope)); }
      if (action === "rebuild-area") { const area = String(this.element.find('[name="rebuildArea"]').val() ?? ""); if (!area) throw new Error("Choose an area."); if (!await confirmAction(`Rebuild ${area}`, "Only module-owned Tokens in this area will be removed and recreated.")) return; const fresh = planPopulation(context.scene, context.data, context.actors, context.anchors, { areas: [area], ignoreExisting: true }); displayStatus(await rebuild(context.scene, fresh, { ...scope, areas: [area] })); }
      await this._refreshContext();
    } catch (error) { if (!String(error.message).includes("cancelled")) ui.notifications.error(`Sier's CoS Populator: ${error.message}`); console.error(`${MODULE_ID} |`, error); } finally { this._actionInFlight = false; if (event.currentTarget?.isConnected) event.currentTarget.disabled = false; }
  }
  async _updateObject(_event, formData) {
    assertGm(); await game.settings.set(MODULE_ID, SETTINGS.preferredPacks, String(formData.preferredPacks ?? "").trim()); const overrides = {}; for (const [key, value] of Object.entries(formData)) if (key.startsWith("override.") && String(value ?? "").trim()) overrides[key.slice(9)] = String(value).trim(); await game.settings.set(MODULE_ID, SETTINGS.actorOverrides, overrides); ui.notifications.info("Sier's CoS Populator settings saved."); await this._refreshContext();
  }
  async close(options = {}) { clearPreview(); cancelAnchorAuthoring(); return super.close(options); }
}
export function openPopulator(locationKey = null) { assertGm(); const app = new RacoozeCosPopulatorApp(); if (locationKey) app.selectedLocation = String(locationKey); return app.render(true); }

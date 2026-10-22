import { loadAllLocations } from "./data-loader.js";
import { isExactSceneGeometry, sceneDefinitions } from "./scene-resolver.js";
import { assertGm } from "./validation.js";
import { documentClass } from "./compatibility.js";

function sourceId(scene) { return String(scene.flags?.["scene-packer"]?.sourceId ?? scene._stats?.compendiumSource ?? ""); }
function copyName(definition) { const original = definition.names?.find((name) => !/\(copy(?:\s+\d+)?\)$/i.test(name)) ?? definition.names?.[0]; return `${original} (Populator Copy)`; }
function findOriginal(definition) {
  const names = new Set((definition.names ?? []).filter((name) => !/\(copy(?:\s+\d+)?\)$/i.test(name)));
  const candidates = game.scenes.contents.filter((scene) => names.has(scene.name) && isExactSceneGeometry(scene, definition));
  return candidates.find((scene) => sourceId(scene).endsWith(definition.sourceSceneId)) ?? candidates[0] ?? null;
}
function findCopy(definition) { return game.scenes.contents.find((scene) => scene.name === copyName(definition) && isExactSceneGeometry(scene, definition)) ?? null; }
export async function safetyCopyStatus({ locationKeys = null } = {}) {
  const rows = [];
  for (const data of (await loadAllLocations()).filter((item) => !locationKeys || locationKeys.includes(item.locationKey))) for (const definition of sceneDefinitions(data)) {
    rows.push({ locationKey: data.locationKey, sceneKey: definition.key, source: findOriginal(definition), copy: findCopy(definition), copyName: copyName(definition), definition });
  }
  return rows;
}
export async function createMissingSafetyCopies(options = {}) {
  assertGm(); const rows = await safetyCopyStatus(options); const created = []; const existing = []; const missingSources = [];
  for (const row of rows) {
    if (row.copy) { existing.push(row.copy); continue; }
    if (!row.source) { missingSources.push({ locationKey: row.locationKey, sceneKey: row.sceneKey, name: row.definition.names?.[0] ?? row.copyName }); continue; }
    const data = row.source.toObject(); delete data._id; data.name = row.copyName; data.navigation = false;
    created.push(await documentClass("Scene").create(data, { renderSheet: false }));
  }
  return { created, existing, missingSources, expected: rows.length };
}

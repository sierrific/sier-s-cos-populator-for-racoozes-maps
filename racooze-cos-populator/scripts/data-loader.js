import { MODULE_ID } from "./constants.js";

const cache = new Map();

async function loadJson(relativePath) {
  if (cache.has(relativePath)) return foundry.utils.deepClone(cache.get(relativePath));
  const response = await fetch(`modules/${MODULE_ID}/data/${relativePath}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load ${relativePath} (${response.status}).`);
  const data = await response.json();
  cache.set(relativePath, data);
  return foundry.utils.deepClone(data);
}

export function loadCampaignIndex() {
  return loadJson("campaign-index.json");
}

export async function loadLocationData(locationKey) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(locationKey))) throw new Error("Invalid location key.");
  const [data, fingerprints] = await Promise.all([loadJson(`locations/${locationKey}.json`), loadJson("scene-fingerprints.json")]);
  return { ...data, scenes: (data.scenes ?? []).map((scene) => ({ ...scene, fingerprint: fingerprints.scenes?.[scene.sourceSceneId] ?? null })) };
}

export async function loadAllLocations() {
  const index = await loadCampaignIndex();
  return Promise.all(index.locations.map((entry) => loadLocationData(entry.key)));
}

export function clearDataCache() {
  cache.clear();
}

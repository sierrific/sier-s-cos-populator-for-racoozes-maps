import { MODULE_ID, SETTINGS } from "./constants.js";
import { isExactSceneGeometry } from "./scene-resolver.js";
import { levelId } from "./compatibility.js";

export function normalizeAreaId(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function documentLabel(document) {
  return document.text?.text ?? document.text ?? document.label ?? document.name ?? document.flags?.[MODULE_ID]?.area ?? "";
}

function areaFromDocument(document, usedAreas) {
  const explicit = normalizeAreaId(document.flags?.[MODULE_ID]?.area);
  if (explicit && usedAreas.has(explicit)) return explicit;
  const label = normalizeAreaId(documentLabel(document));
  if (usedAreas.has(label)) return label;
  for (const area of usedAreas) {
    if (label === `area-${area}` || label === `room-${area}` || label.startsWith(`${area}-`)) return area;
  }
  return null;
}

function centerOf(document) {
  const object = document.toObject?.() ?? document;
  const shape = Array.isArray(object.shapes) ? object.shapes[0] : object.shape;
  const width = Number(object.width ?? shape?.width ?? 0);
  const height = Number(object.height ?? shape?.height ?? 0);
  return {
    x: Number(object.x ?? 0) + width / 2,
    y: Number(object.y ?? 0) + height / 2,
    elevation: object.elevation !== null && object.elevation !== undefined && Number.isFinite(Number(object.elevation)) ? Number(object.elevation) : null,
    radius: null,
    level: levelId(object.level),
    documentId: document.id
  };
}

function discoveredAnchors(scene, usedAreas) {
  const found = new Map();
  const ambiguous = new Map();
  const collections = [scene.notes, scene.drawings, scene.regions, scene.tiles];
  for (const collection of collections) {
    for (const document of collection ?? []) {
      const area = areaFromDocument(document, usedAreas);
      if (!area) continue;
      const anchor = { ...centerOf(document), source: `scene-${document.documentName?.toLowerCase?.() ?? "document"}` };
      if (found.has(area)) {
        ambiguous.set(area, [found.get(area), anchor]);
        found.delete(area);
      } else if (ambiguous.has(area)) ambiguous.get(area).push(anchor);
      else found.set(area, anchor);
    }
  }
  return { found, ambiguous };
}

function manualForScene(scene) {
  const all = game.settings.get(MODULE_ID, SETTINGS.manualAnchors) ?? {};
  return all[scene.uuid] ?? all[scene.id] ?? {};
}

export function resolveAnchors(scene, locationData) {
  const usedAreas = new Set((locationData.encounters ?? []).map((encounter) => normalizeAreaId(encounter.area)));
  const { found, ambiguous } = discoveredAnchors(scene, usedAreas);
  const manual = manualForScene(scene);
  const exactGeometry = isExactSceneGeometry(scene, locationData.scene);
  const results = new Map();

  for (const area of usedAreas) {
    if (manual[area]) {
      results.set(area, { status: "resolved", area, ...manual[area], source: "manual" });
      continue;
    }
    if (found.has(area)) {
      results.set(area, { status: "resolved", area, ...found.get(area) });
      continue;
    }
    const fallback = locationData.anchors?.[area];
    if (exactGeometry && fallback?.verified === true) {
      results.set(area, { status: "resolved", area, ...fallback, source: "verified-fallback" });
      continue;
    }
    if (ambiguous.has(area)) results.set(area, { status: "ambiguous", area, candidates: ambiguous.get(area) });
    else results.set(area, { status: "unresolved", area, reason: fallback ? "fallback-not-verified" : "missing" });
  }
  return results;
}

export async function saveManualAnchor(scene, area, anchor) {
  const normalized = normalizeAreaId(area);
  if (!normalized) throw new Error("Invalid area identifier.");
  const all = foundry.utils.deepClone(game.settings.get(MODULE_ID, SETTINGS.manualAnchors) ?? {});
  all[scene.uuid] ??= {};
  all[scene.uuid][normalized] = {
    x: Number(anchor.x),
    y: Number(anchor.y),
    radius: Number(anchor.radius ?? 0) || null,
    elevation: anchor.elevation != null && Number.isFinite(Number(anchor.elevation)) ? Number(anchor.elevation) : null,
    ...(anchor.level ? { level: levelId(anchor.level) } : {})
  };
  await game.settings.set(MODULE_ID, SETTINGS.manualAnchors, all);
  return all[scene.uuid][normalized];
}

import { RACOOZE_MODULE_ID, RACOOZE_PACK_ID } from "./constants.js";
import { sceneBackgroundSources } from "./compatibility.js";

export function normalizeSceneName(name) {
  return String(name ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function sourceMetadata(scene) {
  const packer = scene.flags?.["scene-packer"] ?? {};
  const sourceId = packer.sourceId ?? scene._stats?.compendiumSource ?? null;
  const sourceModule = packer["source-module"] ?? packer.sourceModule ?? null;
  return { sourceId: String(sourceId ?? ""), sourceModule: String(sourceModule ?? "") };
}

function basename(value) {
  return String(value ?? "").replaceAll("\\", "/").split("/").pop()?.toLowerCase() ?? "";
}

function collectionCount(collection) {
  return Number(collection?.size ?? collection?.length ?? Array.from(collection ?? []).length);
}

export function matchesSceneFingerprint(scene, expected) {
  const fingerprint = expected?.fingerprint;
  if (!fingerprint) return true;
  return collectionCount(scene.walls) === Number(fingerprint.walls)
    && collectionCount(scene.lights) === Number(fingerprint.lights)
    && collectionCount(scene.notes) === Number(fingerprint.notes)
    && collectionCount(scene.tiles) === Number(fingerprint.tiles)
    && collectionCount(scene.drawings) === Number(fingerprint.drawings);
}

export function sceneDefinitions(locationData) {
  return (locationData?.scenes ?? []).map((definition) => ({ ...definition, key: String(definition.key) }));
}

export function scoreScene(scene, expected) {
  const reasons = [];
  let score = 0;
  const source = sourceMetadata(scene);
  const expectedSourceId = String(expected.sourceSceneId ?? "");
  const exactSourceId = Boolean(expectedSourceId && (source.sourceId === expectedSourceId || source.sourceId.endsWith(`.${expectedSourceId}`)));
  const racoozeSource = source.sourceModule === RACOOZE_MODULE_ID || source.sourceId.includes(`Compendium.${RACOOZE_PACK_ID}.`) || Boolean(scene.flags?.[RACOOZE_MODULE_ID]);
  const normalizedName = (expected.names ?? []).map(normalizeSceneName).includes(normalizeSceneName(scene.name));
  const exactGeometry = Number(scene.width) === Number(expected.width)
    && Number(scene.height) === Number(expected.height)
    && Number(scene.grid?.size ?? scene.grid) === Number(expected.grid)
    && Number(scene.padding ?? 0) === Number(expected.padding ?? 0);
  const exactFingerprint = matchesSceneFingerprint(scene, expected);

  if (exactSourceId) {
    score += 120;
    reasons.push("source Scene ID");
  }
  if (source.sourceModule === RACOOZE_MODULE_ID || source.sourceId.includes(`Compendium.${RACOOZE_PACK_ID}.`)) {
    score += 70;
    reasons.push("Racooze source metadata");
  }
  if (scene.flags?.[RACOOZE_MODULE_ID]) {
    score += 50;
    reasons.push("Racooze flags");
  }
  if (normalizedName) {
    score += 40;
    reasons.push("normalized name");
  }
  if (Number(scene.width) === Number(expected.width) && Number(scene.height) === Number(expected.height)) {
    score += 20;
    reasons.push("dimensions");
  }
  if (Number(scene.grid?.size ?? scene.grid) === Number(expected.grid)) {
    score += 10;
    reasons.push("grid");
  }
  if (Number(scene.padding ?? 0) === Number(expected.padding ?? 0)) {
    score += 5;
    reasons.push("padding");
  }
  const backgroundMatch = Boolean(expected.backgroundBasename && sceneBackgroundSources(scene).some((src) => basename(src) === basename(expected.backgroundBasename)));
  if (backgroundMatch) {
    score += 15;
    reasons.push("background basename");
  }
  if (expected.fingerprint) reasons.push(exactFingerprint ? "Scene fingerprint" : "SCENE_FINGERPRINT_MISMATCH");
  // Pack provenance is shared by every Racooze map. Require identity unique to
  // this Scene definition plus the exact geometry used by its anchors.
  const identityMatch = exactSourceId || normalizedName || backgroundMatch;
  return { scene, score, reasons, valid: Boolean(racoozeSource && identityMatch && exactGeometry && exactFingerprint && score >= 70), fingerprintMatch: exactFingerprint };
}

export function scoreLocationScene(scene, locationData) {
  const candidates = sceneDefinitions(locationData).map((definition) => ({ definition, ...scoreScene(scene, definition) }))
    .sort((a, b) => b.score - a.score || a.definition.key.localeCompare(b.definition.key));
  return candidates[0] ?? { definition: null, scene, score: 0, reasons: [], valid: false };
}

export function resolveLocationScene(locationData, preferredScene = canvas?.scene) {
  if (preferredScene) {
    const preferred = scoreLocationScene(preferredScene, locationData);
    if (preferred.valid) return { status: "resolved", ...preferred, candidates: [preferred] };
  }
  const scored = sceneDefinitions(locationData)
    .flatMap((definition) => game.scenes.contents.map((scene) => ({ definition, ...scoreScene(scene, definition) })))
    .sort((a, b) => b.score - a.score || a.definition.key.localeCompare(b.definition.key) || a.scene.name.localeCompare(b.scene.name));
  const candidates = scored.filter((candidate) => candidate.valid);
  if (!candidates.length) return { status: "unresolved", scene: null, definition: null, score: 0, reasons: [], candidates: scored.filter((candidate) => candidate.score >= 70).slice(0, 5) };
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return { status: "ambiguous", scene: null, definition: null, score: candidates[0].score, reasons: [], candidates };
  }
  return { status: "resolved", ...candidates[0], candidates };
}

export function scopeLocationData(locationData, sceneKey) {
  const definition = sceneDefinitions(locationData).find((candidate) => candidate.key === sceneKey);
  if (!definition) throw new Error(`Unknown Scene key for ${locationData.locationKey}: ${sceneKey}`);
  const belongs = (value) => String(value?.sceneKey) === sceneKey;
  const composite = definition.compositeSceneMap;
  if (composite && typeof composite === "object") {
    const sourceKeys = new Set(Object.keys(composite));
    const encounters = (locationData.encounters ?? []).filter((encounter) => sourceKeys.has(String(encounter.sceneKey))).map((encounter) => ({
      ...encounter,
      id: `${encounter.id}-composite`,
      sceneKey
    }));
    const anchors = {};
    for (const [, anchor] of Object.entries(locationData.anchors ?? {})) {
      const transform = composite[String(anchor.sceneKey)];
      if (!transform) continue;
      const scale = Number(transform.scale ?? 1);
      const area = anchor.area;
      anchors[area] = {
        ...anchor,
        sceneKey,
        x: Number(transform.x ?? 0) + (Number(anchor.x) - Number(transform.sourceX ?? 0)) * scale,
        y: Number(transform.y ?? 0) + (Number(anchor.y) - Number(transform.sourceY ?? 0)) * scale
      };
    }
    return { ...locationData, scene: definition, activeSceneKey: sceneKey, encounters, anchors };
  }
  return {
    ...locationData,
    scene: definition,
    activeSceneKey: sceneKey,
    encounters: (locationData.encounters ?? []).filter(belongs),
    anchors: Object.fromEntries(Object.entries(locationData.anchors ?? {}).filter(([, anchor]) => belongs(anchor)).map(([key, anchor]) => [anchor.area ?? key, anchor]))
  };
}

export function isExactSceneGeometry(scene, expected) {
  return Number(scene.width) === Number(expected.width)
    && Number(scene.height) === Number(expected.height)
    && Number(scene.grid?.size ?? scene.grid) === Number(expected.grid)
    && Number(scene.padding ?? 0) === Number(expected.padding ?? 0);
}

export function expectedCanvasBounds(expected) {
  const padding = Number(expected?.padding ?? 0);
  return {
    width: Number(expected?.canvasWidth ?? Number(expected?.width) * (1 + 2 * padding)),
    height: Number(expected?.canvasHeight ?? Number(expected?.height) * (1 + 2 * padding))
  };
}

export function sceneCanvasBounds(scene) {
  const dimensions = scene?.dimensions ?? {};
  const padding = Number(scene?.padding ?? 0);
  return {
    width: Number(dimensions.width ?? Number(scene?.width) * (1 + 2 * padding)),
    height: Number(dimensions.height ?? Number(scene?.height) * (1 + 2 * padding))
  };
}

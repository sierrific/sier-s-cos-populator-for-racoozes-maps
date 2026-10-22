import { CAMPAIGN_KEY, MODULE_ID, RACOOZE_MODULE_ID, RACOOZE_TESTED_VERSION, SUPPORTED_CORE_GENERATIONS } from "./constants.js";
import { expectedCanvasBounds, normalizeSceneName, sceneDefinitions } from "./scene-resolver.js";
import { nativeLevels } from "./compatibility.js";

const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ENCOUNTER_MODES = new Set(["static", "conditional"]);

function actorContract(token, fallbackSources) {
  return JSON.stringify({
    actor: token.actor,
    aliases: token.aliases ?? [],
    resolutionNames: token.resolutionNames ?? [],
    sourcePreference: token.sourcePreference ?? fallbackSources ?? []
  });
}

function rectanglesOverlap(a, b, padding = 2) {
  return a.x < b.x + b.width - padding && a.x + a.width > b.x + padding
    && a.y < b.y + b.height - padding && a.y + a.height > b.y + padding;
}

export function validateEnvironment() {
  const errors = []; const warnings = [];
  const generation = Number(game.release?.generation ?? game.version?.split?.(".")?.[0]);
  if (!SUPPORTED_CORE_GENERATIONS.includes(generation)) errors.push(`Foundry generation ${generation || "unknown"} is unsupported; this build supports v12-v14.`);
  if (game.system?.id !== "dnd5e") errors.push("The active system is not dnd5e.");
  const racooze = game.modules.get(RACOOZE_MODULE_ID);
  if (!racooze?.active) errors.push("Racooze's CoS Maps is not active.");
  else if (racooze.version !== RACOOZE_TESTED_VERSION) warnings.push(`Racooze map version ${racooze.version} differs from tested ${RACOOZE_TESTED_VERSION}; exact geometry checks remain enforced.`);
  if (!game.modules.get("scene-packer")?.active) warnings.push("Scene Packer is inactive; source metadata may be unavailable, so matching may require the active Scene.");
  if (!game.modules.get("plutonium")?.active) warnings.push("Plutonium is inactive; missing Actors must be imported by another method.");
  return { ok: errors.length === 0, errors, warnings };
}

export function validateLocationData(data) {
  const errors = []; const warnings = []; const encounterIds = new Set(); const instances = new Set();
  const scenes = sceneDefinitions(data); const sceneKeys = new Set(); const sourceSceneIds = new Set(); const sceneNames = new Map(); const defaultSceneKey = scenes[0]?.key;
  const actorContracts = new Map(); const anchorIdentities = new Map(); const usedAnchorIdentities = new Set(); const explicitPositions = new Map();
  if (Number(data?.schemaVersion) !== 1) errors.push("Unsupported or missing data schemaVersion.");
  if (data?.campaignKey !== CAMPAIGN_KEY) errors.push(`campaignKey must be ${CAMPAIGN_KEY}.`);
  if (!KEY_PATTERN.test(data?.locationKey ?? "")) errors.push("Missing or invalid locationKey.");
  if (!Array.isArray(data?.encounters)) errors.push("encounters must be an array.");
  if (!scenes.length) errors.push("At least one Scene definition is required.");
  for (const scene of scenes) {
    if (!KEY_PATTERN.test(scene.key)) errors.push(`Invalid Scene key: ${scene.key}`);
    if (sceneKeys.has(scene.key)) errors.push(`Duplicate Scene key: ${scene.key}`); sceneKeys.add(scene.key);
    if (!scene.sourceSceneId) errors.push(`Scene ${scene.key} has no sourceSceneId.`);
    else if (sourceSceneIds.has(scene.sourceSceneId)) errors.push(`Duplicate sourceSceneId: ${scene.sourceSceneId}`); else sourceSceneIds.add(scene.sourceSceneId);
    if (!Array.isArray(scene.names) || !scene.names.length) errors.push(`Scene ${scene.key} has no names.`);
    for (const name of scene.names ?? []) {
      const normalized = normalizeSceneName(name);
      if (!normalized) errors.push(`Scene ${scene.key} has an invalid name.`);
      else if (sceneNames.has(normalized) && sceneNames.get(normalized) !== scene.key) errors.push(`Scene name resolves to multiple definitions: ${name}`);
      else sceneNames.set(normalized, scene.key);
    }
    if (!Number.isFinite(Number(scene.width)) || Number(scene.width) <= 0 || !Number.isFinite(Number(scene.height)) || Number(scene.height) <= 0) errors.push(`Scene ${scene.key} has invalid dimensions.`);
    if (!Number.isFinite(Number(scene.grid)) || Number(scene.grid) <= 0) errors.push(`Scene ${scene.key} has an invalid grid.`);
    if (!Number.isFinite(Number(scene.padding ?? 0)) || Number(scene.padding ?? 0) < 0) errors.push(`Scene ${scene.key} has invalid padding.`);
    for (const field of ["canvasWidth", "canvasHeight"]) if (scene[field] !== undefined && (!Number.isFinite(Number(scene[field])) || Number(scene[field]) <= 0)) errors.push(`Scene ${scene.key} has invalid ${field}.`);
    if (scene.fingerprint !== undefined && scene.fingerprint !== null) for (const field of ["walls", "lights", "notes", "tiles", "drawings"]) if (!Number.isInteger(scene.fingerprint[field]) || scene.fingerprint[field] < 0) errors.push(`Scene ${scene.key} has an invalid fingerprint ${field} count.`);
  }
  for (const scene of scenes) for (const [sourceKey, transform] of Object.entries(scene.compositeSceneMap ?? {})) {
    if (sourceKey === scene.key || !sceneKeys.has(sourceKey)) errors.push(`Scene ${scene.key} has an unknown composite source: ${sourceKey}`);
    if (!["x", "y", "sourceX", "sourceY"].every((field) => Number.isFinite(Number(transform?.[field] ?? 0)))) errors.push(`Scene ${scene.key} has an invalid composite transform for ${sourceKey}.`);
    if (!Number.isFinite(Number(transform?.scale ?? 1)) || Number(transform?.scale ?? 1) <= 0) errors.push(`Scene ${scene.key} has an invalid composite scale for ${sourceKey}.`);
  }

  for (const [key, anchor] of Object.entries(data?.anchors ?? {})) {
    const area = anchor.area ?? key; const sceneKey = String(anchor.sceneKey ?? defaultSceneKey); const identity = `${sceneKey}|${area}`;
    if (!KEY_PATTERN.test(area)) errors.push(`Malformed anchor area id: ${area}`);
    if (anchorIdentities.has(identity)) errors.push(`Duplicate anchor for ${identity}: ${anchorIdentities.get(identity)} and ${key}`); else anchorIdentities.set(identity, key);
    const scene = scenes.find((candidate) => candidate.key === sceneKey);
    if (!scene) errors.push(`Unknown Scene key for anchor ${area}.`);
    if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.y)) errors.push(`Invalid anchor coordinates: ${area}`);
    else if (scene) { const bounds = expectedCanvasBounds(scene); if (anchor.x < 0 || anchor.y < 0 || anchor.x > bounds.width || anchor.y > bounds.height) errors.push(`Out-of-bounds anchor: ${area}`); }
    if (anchor.radius !== undefined && (!Number.isFinite(Number(anchor.radius)) || Number(anchor.radius) < 0)) errors.push(`Invalid anchor radius: ${area}`);
    if (anchor.referenceOnly !== undefined && typeof anchor.referenceOnly !== "boolean") errors.push(`Invalid referenceOnly flag: ${area}`);
    if (anchor.verified !== true) warnings.push(`Anchor ${area} is not verified and will not be used automatically.`);
  }

  for (const encounter of data?.encounters ?? []) {
    if (!encounter.id) errors.push("Encounter without id."); else if (encounterIds.has(encounter.id)) errors.push(`Duplicate encounter id: ${encounter.id}`); else encounterIds.add(encounter.id);
    if (!KEY_PATTERN.test(String(encounter.area ?? "").toLowerCase())) errors.push(`Malformed area id in ${encounter.id}: ${encounter.area}`);
    if (!Array.isArray(encounter.tokens) || !encounter.tokens.length) errors.push(`Encounter ${encounter.id} has no tokens.`);
    const encounterSceneKey = String(encounter.sceneKey ?? defaultSceneKey);
    if (!sceneKeys.has(encounterSceneKey)) errors.push(`Unknown Scene key in ${encounter.id}: ${encounterSceneKey}`);
    const anchorIdentity = `${encounterSceneKey}|${encounter.area}`; usedAnchorIdentities.add(anchorIdentity);
    if (encounter.autoPopulate !== false && !anchorIdentities.has(anchorIdentity)) errors.push(`Automatic encounter ${encounter.id} has no matching anchor.`);
    if (!ENCOUNTER_MODES.has(encounter.mode)) errors.push(`Invalid encounter mode in ${encounter.id}: ${encounter.mode}`);
    if (encounter.autoPopulate !== undefined && typeof encounter.autoPopulate !== "boolean") errors.push(`Invalid autoPopulate flag in ${encounter.id}.`);
    if (encounter.humanReview !== undefined && typeof encounter.humanReview !== "boolean") errors.push(`Invalid humanReview flag in ${encounter.id}.`);
    if (encounter.radius !== undefined && (!Number.isFinite(Number(encounter.radius)) || Number(encounter.radius) < 0)) errors.push(`Invalid radius in ${encounter.id}.`);
    if (encounter.mode === "conditional" && encounter.autoPopulate !== false) {
      if (!encounter.warningCode) errors.push(`${encounter.id} is an enabled conditional encounter without warningCode.`);
      else if (!KEY_PATTERN.test(encounter.warningCode)) errors.push(`${encounter.id} has a malformed warningCode.`);
      if (encounter.humanReview !== true) errors.push(`${encounter.id} is an enabled conditional encounter without humanReview.`);
      if ((encounter.tokens ?? []).some((token) => token.hidden !== true)) errors.push(`${encounter.id} is an enabled conditional encounter with a visible Token.`);
    }
    const actorKeys = new Set();
    for (const token of encounter.tokens ?? []) {
      if (!KEY_PATTERN.test(token.actorKey ?? "")) errors.push(`Invalid actorKey in ${encounter.id}.`);
      else if (actorKeys.has(token.actorKey)) errors.push(`Duplicate actorKey in ${encounter.id}: ${token.actorKey}`);
      if (!token.actor) errors.push(`Missing actor name in ${encounter.id}/${token.actorKey ?? "unknown"}.`);
      const contract = actorContract(token, data.actorSourcePreference);
      if (actorContracts.has(token.actorKey) && actorContracts.get(token.actorKey) !== contract) errors.push(`Inconsistent Actor contract for ${token.actorKey}.`); else actorContracts.set(token.actorKey, contract);
      if (!Number.isInteger(token.count) || token.count < 1) errors.push(`Invalid count in ${encounter.id}/${token.actorKey}.`);
      if (token.stackWith && !actorKeys.has(token.stackWith)) errors.push(`stackWith must reference an earlier actorKey in ${encounter.id}/${token.actorKey}.`);
      if (token.disposition !== undefined && ![-1, 0, 1].includes(token.disposition)) errors.push(`Invalid disposition in ${encounter.id}/${token.actorKey}.`);
      if (token.hidden !== undefined && typeof token.hidden !== "boolean") errors.push(`Invalid hidden flag in ${encounter.id}/${token.actorKey}.`);
      if (token.allowStack !== undefined && typeof token.allowStack !== "boolean") errors.push(`Invalid allowStack flag in ${encounter.id}/${token.actorKey}.`);
      for (const field of ["tokenWidth", "tokenHeight"]) if (token[field] !== undefined && (!Number.isFinite(Number(token[field])) || Number(token[field]) <= 0)) errors.push(`Invalid ${field} in ${encounter.id}/${token.actorKey}.`);
      if (token.elevation !== undefined && !Number.isFinite(Number(token.elevation))) errors.push(`Invalid elevation in ${encounter.id}/${token.actorKey}.`);
      for (const field of ["aliases", "resolutionNames", "sourcePreference"]) if (token[field] !== undefined && (!Array.isArray(token[field]) || token[field].some((value) => typeof value !== "string" || !value.trim()))) errors.push(`Invalid ${field} in ${encounter.id}/${token.actorKey}.`);
      if (token.positions !== undefined && (!Array.isArray(token.positions) || token.positions.length !== token.count)) errors.push(`positions must contain exactly count entries in ${encounter.id}/${token.actorKey}.`);
      const scene = scenes.find((candidate) => candidate.key === encounterSceneKey); const scenePositions = explicitPositions.get(encounterSceneKey) ?? [];
      for (const [positionIndex, position] of (token.positions ?? []).entries()) {
        const width = Number(position?.width ?? token.tokenWidth ?? 1); const height = Number(position?.height ?? token.tokenHeight ?? 1);
        if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y) || !Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) errors.push(`Invalid exact position in ${encounter.id}/${token.actorKey}.`);
        else if (scene) {
          const rect = { x: Number(position.x), y: Number(position.y), width: width * Number(scene.grid), height: height * Number(scene.grid), allowStack: Boolean(token.allowStack || token.stackWith), label: `${encounter.id}/${token.actorKey}#${positionIndex + 1}` };
          const bounds = expectedCanvasBounds(scene);
          if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > bounds.width || rect.y + rect.height > bounds.height) errors.push(`Out-of-bounds exact position: ${rect.label}`);
          const collision = scenePositions.find((other) => !rect.allowStack && !other.allowStack && rectanglesOverlap(rect, other));
          if (collision) errors.push(`Overlapping exact positions require allowStack: ${collision.label} and ${rect.label}`);
          scenePositions.push(rect);
        }
        if (position?.elevation !== undefined && !Number.isFinite(Number(position.elevation))) errors.push(`Invalid exact-position elevation in ${encounter.id}/${token.actorKey}.`);
      }
      explicitPositions.set(encounterSceneKey, scenePositions);
      for (let instance = 1; instance <= (token.count ?? 0); instance += 1) { const key = `${encounter.id}|${token.actorKey}|${instance}`; if (instances.has(key)) errors.push(`Duplicate token instance id: ${key}`); instances.add(key); }
      actorKeys.add(token.actorKey);
    }
  }
  for (const [identity, key] of anchorIdentities) {
    const anchor = data.anchors[key];
    if (!usedAnchorIdentities.has(identity) && anchor.referenceOnly !== true) warnings.push(`Anchor ${anchor.area ?? key} is not used by an encounter.`);
  }
  for (const composite of scenes.filter((scene) => scene.compositeSceneMap)) {
    const bounds = expectedCanvasBounds(composite);
    for (const anchor of Object.values(data.anchors ?? {})) {
      const transform = composite.compositeSceneMap[String(anchor.sceneKey)]; if (!transform) continue;
      const scale = Number(transform.scale ?? 1); const x = Number(transform.x ?? 0) + (Number(anchor.x) - Number(transform.sourceX ?? 0)) * scale; const y = Number(transform.y ?? 0) + (Number(anchor.y) - Number(transform.sourceY ?? 0)) * scale;
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > bounds.width || y > bounds.height) errors.push(`Composite anchor is out of bounds in ${composite.key}: ${anchor.area}`);
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

function snapshots(collection) { return Array.from(collection ?? [], (document) => ({ id: document.id ?? document._id, data: serializable(document.toObject?.() ?? document) })).sort((a, b) => String(a.id).localeCompare(String(b.id))); }
function serializable(value) { try { return JSON.parse(JSON.stringify(value ?? null)); } catch { return String(value ?? ""); } }
function sceneConfiguration(scene) {
  return {
    width: Number(scene.width), height: Number(scene.height), padding: Number(scene.padding ?? 0),
    grid: serializable(scene.grid?.toObject?.() ?? scene.grid),
    background: nativeLevels(scene).length ? null : serializable(scene.background), foreground: nativeLevels(scene).length ? null : serializable(scene.foreground),
    nativeLevels: snapshots(scene.levels),
    levels: serializable(scene.flags?.levels), wallHeight: serializable(scene.flags?.["wall-height"])
  };
}
export function fingerprintScene(scene) {
  return { sceneId: scene.id, sceneConfiguration: sceneConfiguration(scene), tokens: Array.from(scene.tokens ?? [], (d) => d.id).sort(), tokenSnapshots: snapshots(scene.tokens), walls: snapshots(scene.walls), lights: snapshots(scene.lights), tiles: snapshots(scene.tiles), notes: snapshots(scene.notes), sounds: snapshots(scene.sounds), drawings: snapshots(scene.drawings), regions: snapshots(scene.regions) };
}
export function verifyTokenOnlyMutation(before, after, { created = [], removed = [] } = {}) {
  const errors = [];
  if (JSON.stringify(before.sceneConfiguration) !== JSON.stringify(after.sceneConfiguration)) errors.push("Scene configuration changed unexpectedly.");
  for (const key of ["walls", "lights", "tiles", "notes", "sounds", "drawings", "regions"]) if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) errors.push(`${key} changed unexpectedly.`);
  const beforeTokens = new Set(before.tokens); const afterTokens = new Set(after.tokens);
  const actualCreated = [...afterTokens].filter((id) => !beforeTokens.has(id)).sort(); const actualRemoved = [...beforeTokens].filter((id) => !afterTokens.has(id)).sort();
  if (JSON.stringify(actualCreated) !== JSON.stringify([...created].sort())) errors.push(`Unexpected token creation set: ${actualCreated.join(", ") || "none"}.`);
  if (JSON.stringify(actualRemoved) !== JSON.stringify([...removed].sort())) errors.push(`Unexpected token removal set: ${actualRemoved.join(", ") || "none"}.`);
  const beforeSnapshots = new Map((before.tokenSnapshots ?? []).map((e) => [e.id, e.data])); const afterSnapshots = new Map((after.tokenSnapshots ?? []).map((e) => [e.id, e.data]));
  const changed = [...beforeSnapshots.keys()].filter((id) => afterSnapshots.has(id) && JSON.stringify(beforeSnapshots.get(id)) !== JSON.stringify(afterSnapshots.get(id))).sort();
  if (changed.length) errors.push(`Existing Tokens changed unexpectedly: ${changed.join(", ")}.`);
  return { ok: errors.length === 0, errors, actualCreated, actualRemoved, changed };
}
export function assertGm() { if (!game.user?.isGM) throw new Error(`${MODULE_ID} is GM-only.`); }

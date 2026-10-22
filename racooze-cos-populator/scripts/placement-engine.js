import { makeTokenFlag, populationKey, getPopulationFlag } from "./flags.js";
import { sceneCanvasBounds } from "./scene-resolver.js";
import { normalizeAreaId } from "./anchor-resolver.js";
import { levelId, resolveSceneLevel, sceneLevelSignature } from "./compatibility.js";

function rectFor(x, y, width, height, grid) { return { x, y, width: width * grid, height: height * grid }; }
function overlaps(a, b, padding = 2) { return a.x < b.x + b.width - padding && a.x + a.width > b.x + padding && a.y < b.y + b.height - padding && a.y + a.height > b.y + padding; }
function wallSegments(scene) { return Array.from(scene.walls ?? [], (wall) => wall.c ?? wall.toObject?.().c).filter((c) => Array.isArray(c) && c.length === 4); }

function intersectsWalls(rect, walls) {
  const edges = [
    [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }],
    [{ x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }],
    [{ x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }],
    [{ x: rect.x, y: rect.y + rect.height }, { x: rect.x, y: rect.y }]
  ];
  return walls.some(([x1, y1, x2, y2]) => edges.some(([a, b]) => foundry.utils.lineSegmentIntersects(a, b, { x: x1, y: y1 }, { x: x2, y: y2 })));
}

function spiralOffsets(radius) {
  const result = [{ x: 0, y: 0 }];
  const rings = Math.max(0, Math.floor(Number(radius) || 0));
  for (let ring = 1; ring <= rings; ring += 1) {
    for (let x = -ring; x <= ring; x += 1) result.push({ x, y: -ring });
    for (let y = -ring + 1; y <= ring; y += 1) result.push({ x: ring, y });
    for (let x = ring - 1; x >= -ring; x -= 1) result.push({ x, y: ring });
    for (let y = ring - 1; y > -ring; y -= 1) result.push({ x: -ring, y });
  }
  return result;
}

function snap(value, grid) { return Math.round(value / grid) * grid; }
function tokenDimensions(actor, spec = {}) {
  const proto = actor.prototypeToken ?? {};
  return { width: Number(spec.tokenWidth ?? proto.width ?? 1), height: Number(spec.tokenHeight ?? proto.height ?? 1) };
}
function existingRects(scene, ignoreModuleTokens) {
  const grid = Number(scene.grid.size);
  return Array.from(scene.tokens ?? []).filter((token) => !ignoreModuleTokens || !getPopulationFlag(token)).map((token) => ({
    ...rectFor(Number(token.x), Number(token.y), Number(token.width ?? 1), Number(token.height ?? 1), grid), id: token.id, module: Boolean(getPopulationFlag(token)), level: levelId(token.level)
  }));
}
function existingPlacement(scene, token) {
  const grid = Number(scene.grid.size);
  const width = Number(token.width ?? 1); const height = Number(token.height ?? 1);
  return { x: Number(token.x), y: Number(token.y), width, height, rect: rectFor(Number(token.x), Number(token.y), width, height, grid), elevation: Number(token.elevation ?? 0), level: levelId(token.level), token };
}

function exactPosition({ scene, actor, spec, instance, occupied }) {
  const requested = spec.positions?.[instance - 1];
  if (!requested) return null;
  const grid = Number(scene.grid.size); const fallback = tokenDimensions(actor, spec);
  const width = Number(requested.width ?? fallback.width); const height = Number(requested.height ?? fallback.height);
  const x = Number(requested.x); const y = Number(requested.y); const bounds = sceneCanvasBounds(scene);
  const rect = rectFor(x, y, width, height, grid);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  if (x < 0 || y < 0 || x + rect.width > bounds.width || y + rect.height > bounds.height) return null;
  if (!spec.allowStack && occupied.some((other) => overlaps(rect, other))) return null;
  return { x, y, width, height, rect, exact: true, elevation: Number(requested.elevation ?? spec.elevation ?? 0) };
}

function findPosition({ scene, anchor, actor, spec, radius, occupied }) {
  const grid = Number(scene.grid.size); const dims = tokenDimensions(actor, spec); const walls = wallSegments(scene); const bounds = sceneCanvasBounds(scene);
  for (const offset of spiralOffsets(radius)) {
    const x = snap(anchor.x - (dims.width * grid) / 2 + offset.x * grid, grid);
    const y = snap(anchor.y - (dims.height * grid) / 2 + offset.y * grid, grid);
    const rect = rectFor(x, y, dims.width, dims.height, grid);
    if (x < 0 || y < 0 || x + rect.width > bounds.width || y + rect.height > bounds.height) continue;
    if (!spec.allowStack && occupied.some((other) => overlaps(rect, other))) continue;
    if (intersectsWalls(rect, walls)) continue;
    return { x, y, width: dims.width, height: dims.height, rect, elevation: Number(spec.elevation ?? anchor.elevation ?? 0) };
  }
  return null;
}

function shouldPopulate(encounter) { return encounter.autoPopulate !== false; }
export function expectedPopulationKeys(locationData) {
  const keys = new Set();
  for (const encounter of locationData.encounters ?? []) {
    if (!shouldPopulate(encounter)) continue;
    for (const token of encounter.tokens ?? []) for (let instance = 1; instance <= token.count; instance += 1) {
      keys.add(populationKey(makeTokenFlag({ locationKey: locationData.locationKey, sceneKey: locationData.activeSceneKey, area: normalizeAreaId(encounter.area), encounterId: encounter.id, actorKey: token.actorKey, instance })));
    }
  }
  return keys;
}

export function planPopulation(scene, locationData, actors, anchors, { areas = null, ignoreExisting = false } = {}) {
  const wantedAreas = areas ? new Set(Array.from(areas, normalizeAreaId)) : null;
  const existing = new Map();
  for (const token of scene.tokens ?? []) { const flag = getPopulationFlag(token); const key = populationKey(flag); if (key && !ignoreExisting) existing.set(key, token); }
  const occupied = existingRects(scene, ignoreExisting); const placements = []; const skipped = []; const warnings = []; const encounterPlacements = new Map();
  for (const encounter of locationData.encounters ?? []) {
    const area = normalizeAreaId(encounter.area);
    if (wantedAreas && !wantedAreas.has(area)) continue;
    if (!shouldPopulate(encounter)) {
      skipped.push({ encounterId: encounter.id, area, reason: "review-only" });
      if (encounter.mode === "conditional" || encounter.humanReview) warnings.push({ encounterId: encounter.id, area, reason: encounter.warningCode ?? "human-review", humanReview: Boolean(encounter.humanReview) });
      continue;
    }
    if (encounter.mode === "conditional") warnings.push({ encounterId: encounter.id, area, reason: encounter.warningCode ?? "conditional-hidden", humanReview: Boolean(encounter.humanReview) });
    const anchor = anchors.get(area);
    if (anchor?.status !== "resolved") { skipped.push({ encounterId: encounter.id, area, reason: `anchor-${anchor?.status ?? "unresolved"}` }); continue; }
    const byActor = new Map(); encounterPlacements.set(encounter.id, byActor);
    for (const spec of encounter.tokens ?? []) {
      const resolution = actors.get(spec.actorKey);
      if (resolution?.status !== "resolved" || !resolution.document) { skipped.push({ encounterId: encounter.id, area, actorKey: spec.actorKey, reason: `actor-${resolution?.status ?? "unresolved"}` }); continue; }
      const placedForActor = new Map(); byActor.set(spec.actorKey, placedForActor);
      for (let instance = 1; instance <= spec.count; instance += 1) {
        const flag = makeTokenFlag({ locationKey: locationData.locationKey, sceneKey: locationData.activeSceneKey, area, encounterId: encounter.id, actorKey: spec.actorKey, instance });
        const key = populationKey(flag);
        if (existing.has(key)) { const placed = existingPlacement(scene, existing.get(key)); placedForActor.set(instance, placed); skipped.push({ encounterId: encounter.id, area, actorKey: spec.actorKey, instance, reason: "already-present", tokenId: existing.get(key).id }); continue; }
        let position; let level;
        const hosts = spec.stackWith ? byActor.get(spec.stackWith) : null;
        const host = hosts?.get(instance) ?? hosts?.get(1) ?? hosts?.values().next().value;
        const elevation = Number(host?.elevation ?? spec.positions?.[instance - 1]?.elevation ?? spec.elevation ?? anchor.elevation ?? 0);
        try { level = resolveSceneLevel(scene, elevation, host?.level ?? anchor.level); }
        catch (error) { skipped.push({ encounterId: encounter.id, area, actorKey: spec.actorKey, instance, reason: error.message }); continue; }
        const levelOccupied = occupied.filter((rect) => !level || !rect.level || rect.level === level);
        if (spec.stackWith) position = host && { x: host.x, y: host.y, width: host.width, height: host.height, rect: host.rect, elevation: host.elevation, level: host.level };
        else if (Array.isArray(spec.positions)) position = exactPosition({ scene, actor: resolution.document, spec, instance, occupied: levelOccupied });
        else position = findPosition({ scene, anchor, actor: resolution.document, spec, radius: encounter.radius ?? anchor.radius ?? 4, occupied: levelOccupied });
        if (!position) { skipped.push({ encounterId: encounter.id, area, actorKey: spec.actorKey, instance, reason: spec.stackWith ? "stack-host-unavailable" : Array.isArray(spec.positions) ? "exact-position-unavailable" : "no-collision-free-position" }); continue; }
        if (!spec.stackWith) position.elevation = elevation;
        const placement = { key, flag, encounter, spec, actor: resolution.document, actorResolution: resolution, anchor, instance, level, ...position };
        placements.push(placement); placedForActor.set(instance, placement); if (!spec.stackWith) occupied.push({ ...position.rect, level: placement.level, planned: true });
      }
    }
    if (encounter.humanReview && encounter.mode !== "conditional") warnings.push({ encounterId: encounter.id, area, reason: "human-review", humanReview: true });
  }
  return { placements, skipped, warnings, existing, expectedKeys: expectedPopulationKeys(locationData), encounterPlacements, levelSignature: sceneLevelSignature(scene) };
}

import { getPopulationFlag } from "./flags.js";

import { levelId, resolveSceneLevel } from "./compatibility.js";

function centerOf(entry, grid) {
  return { x: Number(entry.x) + Number(entry.width ?? 1) * grid / 2, y: Number(entry.y) + Number(entry.height ?? 1) * grid / 2 };
}

export function encounterFocusPoint({ scene, locationKey, sceneKey, encounter, plan = null, anchor = null }) {
  const grid = Number(scene.grid?.size ?? scene.grid ?? 100);
  const existing = Array.from(scene.tokens ?? []).find((token) => {
    const flag = getPopulationFlag(token);
    return flag?.locationKey === locationKey && flag?.sceneKey === sceneKey && flag?.encounterId === encounter.id;
  });
  if (existing) return centerOf(existing, grid);
  const planned = plan?.placements?.find((placement) => placement.encounter.id === encounter.id);
  if (planned) return centerOf(planned, grid);
  if (anchor?.status === "resolved") return { x: Number(anchor.x), y: Number(anchor.y) };
  return null;
}

export async function panToEncounter(options) {
  const { scene } = options;
  const point = encounterFocusPoint(options);
  if (!point) throw new Error(`No resolved position is available for ${options.encounter.id}.`);
  const token = Array.from(scene.tokens ?? []).find((entry) => {
    const flag = getPopulationFlag(entry);
    return flag?.locationKey === options.locationKey && flag?.sceneKey === options.sceneKey && flag?.encounterId === options.encounter.id;
  });
  const placement = options.plan?.placements?.find((entry) => entry.encounter.id === options.encounter.id);
  const level = levelId(token?.level) ?? placement?.level ?? resolveSceneLevel(scene, options.anchor?.elevation ?? 0, options.anchor?.level);
  if (canvas?.scene?.id !== scene.id || (level && levelId(canvas.level) !== level)) await scene.view(level ? { level } : {});
  await canvas.animatePan({ ...point, scale: Math.max(Number(canvas.stage?.scale?.x ?? 1), 1) });
  return point;
}

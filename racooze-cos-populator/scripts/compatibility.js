import { MODULE_ID } from "./constants.js";

// V14 no longer exposes several former globals. Resolve at call time so that
// configured system document subclasses are retained (especially dnd5e Actor).
export function documentClass(name) {
  const cls = globalThis.CONFIG?.[name]?.documentClass ?? globalThis.foundry?.documents?.[name] ?? globalThis[name];
  if (!cls) throw new Error(`Foundry document class ${name} is unavailable.`);
  return cls;
}

export function resolveUuid(uuid) {
  const resolve = globalThis.foundry?.utils?.fromUuid ?? globalThis.fromUuid;
  if (!resolve) throw new Error("Foundry UUID resolution is unavailable.");
  return resolve(uuid);
}

export function addSceneControl(controls, open) {
  if (!game.user?.isGM) return;
  const tokenControls = Array.isArray(controls)
    ? controls.find((control) => ["token", "tokens"].includes(control.name))
    : controls?.tokens ?? controls?.token;
  if (!tokenControls?.tools) return;
  const name = `${MODULE_ID}-open`;
  const tool = { name, title: "Sier's CoS Populator for Racooze's Maps", icon: "fas fa-users-viewfinder", button: true };
  if (Array.isArray(tokenControls.tools)) {
    if (!tokenControls.tools.some((item) => item.name === name)) tokenControls.tools.push({ ...tool, onClick: open });
  } else {
    const orders = Object.values(tokenControls.tools).map((item) => Number(item.order) || 0);
    tokenControls.tools[name] = { ...tool, order: Math.max(-1, ...orders) + 1, onChange: (_event, active) => { if (active !== false) return open(); } };
  }
}

export async function confirmAction(title, content) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (DialogV2) return (await DialogV2.confirm({ window: { title }, content, modal: true, rejectClose: false, yes: { default: false }, no: { default: true } })) === true;
  const DialogV1 = globalThis.foundry?.appv1?.api?.Dialog ?? globalThis.Dialog;
  return (await DialogV1.confirm({ title, content, yes: () => true, no: () => false, defaultYes: false })) === true;
}

export function nativeLevels(scene) { return Array.from(scene?.levels ?? []); }

export function levelId(value) { return typeof value === "string" ? value : value?.id ?? value?._id ?? null; }

export function sceneBackgroundSources(scene) {
  const levels = nativeLevels(scene);
  // Do not use the v14 legacy scene.background shim, which can depend on view.
  return levels.length ? levels.map((level) => level.background?.src).filter(Boolean) : [scene.background?.src ?? scene.img].filter(Boolean);
}

export function resolveSceneLevel(scene, elevation = 0, preferred = null) {
  const levels = nativeLevels(scene);
  if (!levels.length) return null; // v12/v13 and plain pre-migration fixtures
  if (preferred) {
    const id = levelId(preferred);
    if (!levels.some((level) => levelId(level) === id)) throw new Error("native-level-missing");
    return id;
  }
  // Flat maps imported into v14 gain a single level. Preserve their elevations.
  if (levels.length === 1) return levelId(levels[0]);
  const matches = levels.filter((level) => {
    const bottom = level.elevation?.bottom ?? -Infinity;
    const top = level.elevation?.top ?? Infinity;
    return Number(elevation) >= bottom && Number(elevation) < top;
  });
  if (matches.length !== 1) throw new Error(matches.length ? "native-level-ambiguous" : "native-level-unresolved");
  return levelId(matches[0]);
}

export function sceneLevelSignature(scene) {
  return JSON.stringify(nativeLevels(scene).map((level) => ({ id: levelId(level), data: level.toObject?.() ?? level })).sort((a, b) => String(a.id).localeCompare(String(b.id))));
}

export function assertPlanLevels(scene, plan) {
  if (plan.levelSignature !== undefined && plan.levelSignature !== sceneLevelSignature(scene)) throw new Error("Scene Levels changed after review. Refresh the population plan.");
  if (plan.skipped?.some((entry) => entry.reason.startsWith("native-level-"))) throw new Error("Resolve ambiguous or missing Scene Levels before population.");
}

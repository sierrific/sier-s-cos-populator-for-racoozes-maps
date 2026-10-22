import { MODULE_ID, MODULE_VERSION } from "./constants.js";
import { loadAllLocations } from "./data-loader.js";
import { actorSpecs, normalizeActorName, resolveActorSpec } from "./actor-resolver.js";
import { assertGm } from "./validation.js";
import { documentClass, resolveUuid } from "./compatibility.js";

async function importFolder() {
  return game.folders.find((folder) => folder.type === "Actor" && folder.name === "Sier's CoS Populator Imports")
    ?? documentClass("Folder").create({ name: "Sier's CoS Populator Imports", type: "Actor", sorting: "a" });
}
export function isManagedImport(actor, folder = null) {
  const marker = actor?.flags?.[MODULE_ID]?.importedActor;
  return Boolean(marker?.sourceUuid) && (!folder || (actor.folder?.id ?? actor.folder) === folder.id);
}
function redundantImports(folder) {
  const groups = new Map();
  for (const actor of game.actors) { const key = normalizeActorName(actor.name); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(actor); }
  const duplicates = [];
  for (const actors of groups.values()) {
    if (actors.length < 2) continue;
    const imported = actors.filter((actor) => isManagedImport(actor, folder));
    if (imported.length > 1) duplicates.push(...imported.slice().sort((a, b) => a.id.localeCompare(b.id)).slice(1));
  }
  return duplicates;
}
export async function importAvailableActors({ locationKeys = null } = {}) {
  assertGm(); const folder = await importFolder(); const duplicateImports = redundantImports(folder);
  const created = []; const alreadyResolved = []; const blocked = []; const processed = new Set();
  const locations = await loadAllLocations();
  for (const data of locations.filter((item) => !locationKeys || locationKeys.includes(item.locationKey))) {
    for (const spec of actorSpecs(data).values()) {
      const identity = JSON.stringify([spec.actor, spec.resolutionNames, spec.aliases]); if (processed.has(identity)) continue; processed.add(identity);
      const result = await resolveActorSpec(spec);
      if (result.status === "resolved") { alreadyResolved.push(result.document); continue; }
      if (result.status !== "requiresImport" || !result.uuid) { blocked.push({ locationKey: data.locationKey, actor: spec.actor, actorKey: spec.actorKey, status: result.status, candidates: result.candidates?.length ?? 0 }); continue; }
      const source = await resolveUuid(result.uuid);
      if (!source || source.documentName !== "Actor") { blocked.push({ locationKey: data.locationKey, actor: spec.actor, actorKey: spec.actorKey, status: "invalid-compendium-source", candidates: 0 }); continue; }
      const actorData = source.toObject(); delete actorData._id; actorData.folder = folder.id; actorData.flags ??= {};
      actorData.flags[MODULE_ID] = { ...(actorData.flags[MODULE_ID] ?? {}), importedActor: { sourceUuid: source.uuid, version: MODULE_VERSION } };
      created.push(await documentClass("Actor").create(actorData, { renderSheet: false }));
    }
  }
  duplicateImports.push(...redundantImports(folder).filter((actor) => !duplicateImports.some((existing) => existing.id === actor.id)));
  return { created, alreadyResolved, blocked, duplicateImports, removedDuplicates: [], processed: processed.size, folder };
}

import { MODULE_ID, SETTINGS } from "./constants.js";
import { debugLog } from "./logger.js";
import { resolveUuid } from "./compatibility.js";

export function normalizeActorName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function actorSpecs(levelData) {
  const specs = new Map();
  for (const encounter of levelData.encounters ?? []) {
    for (const token of encounter.tokens ?? []) {
      if (!specs.has(token.actorKey)) {
        specs.set(token.actorKey, {
          actorKey: token.actorKey,
          actor: token.actor,
          aliases: token.aliases ?? [],
          resolutionNames: token.resolutionNames ?? [],
          sourcePreference: token.sourcePreference ?? levelData.actorSourcePreference ?? []
        });
      }
    }
  }
  return specs;
}

function safeNameVariants(value) {
  const normalized = normalizeActorName(value);
  const variants = new Set([normalized]);
  const words = normalized.split(" ");
  const last = words.at(-1) ?? "";
  let singular = null;
  if (last.endsWith("ies") && last.length > 3) singular = `${last.slice(0, -3)}y`;
  else if (/(?:ches|shes|xes|zes)$/.test(last)) singular = last.slice(0, -2);
  else if (last.endsWith("s") && !/(?:ss|us|is)$/.test(last)) singular = last.slice(0, -1);
  if (singular) variants.add([...words.slice(0, -1), singular].join(" "));
  return variants;
}

function exactMatches(documents, name) {
  const wanted = normalizeActorName(name);
  const exact = documents.filter((document) => normalizeActorName(document.name) === wanted);
  if (exact.length) return exact;
  const wantedVariants = safeNameVariants(name);
  return documents.filter((document) => {
    const variants = safeNameVariants(document.name);
    return [...wantedVariants].some((variant) => variants.has(variant));
  });
}

function sourceCode(document) {
  const value = document.flags?.plutonium?.source
    ?? document.flags?.["5etools"]?.source
    ?? document.system?.source?.book
    ?? document._stats?.compendiumSource
    ?? "";
  const matched = String(value).match(/(?:^|[.@])([A-Za-z][A-Za-z0-9]{1,12})(?:$|[.@])/);
  return (matched?.[1] ?? value).toString().trim().toUpperCase();
}

function candidate(document, source, pack = null) {
  return {
    name: document.name,
    uuid: document.uuid,
    id: document.id,
    source,
    pack: pack?.collection ?? null,
    folderName: document.folder?.name ?? "",
    sourceCode: sourceCode(document),
    document
  };
}

function preferWorldFolders(candidates) {
  if (candidates.length < 2) return candidates;
  const preferred = ["Sier's CoS Populator Imports", "Monster Manual", "Creatures"];
  for (const folder of preferred) {
    const matches = candidates.filter((item) => item.folderName === folder);
    if (matches.length) return matches;
  }
  return candidates;
}

function preferSources(candidates, sourcePreference = []) {
  if (candidates.length < 2 || !sourcePreference.length) return candidates;
  const priorities = new Map(sourcePreference.map((source, index) => [String(source).toUpperCase(), index]));
  const ranked = candidates.map((item) => ({ item, rank: priorities.get(item.sourceCode) ?? Number.MAX_SAFE_INTEGER }));
  const best = Math.min(...ranked.map(({ rank }) => rank));
  if (!Number.isFinite(best) || best === Number.MAX_SAFE_INTEGER) return candidates;
  return ranked.filter(({ rank }) => rank === best).map(({ item }) => item);
}

function decide(candidates, source, matchedName, sourcePreference = []) {
  candidates = preferSources(candidates, sourcePreference);
  if (source === "world") candidates = preferWorldFolders(candidates);
  if (candidates.length === 1) {
    return { status: source === "world" ? "resolved" : "requiresImport", source, matchedName, ...candidates[0] };
  }
  if (candidates.length > 1) return { status: "ambiguous", source, matchedName, candidates };
  return null;
}

async function packCandidates(pack, name) {
  const index = await pack.getIndex({ fields: ["name", "flags", "system.source", "_stats.compendiumSource"] });
  return exactMatches(Array.from(index), name).map((entry) => candidate(entry, "compendium", pack));
}

async function resolveOverride(actorKey, overrides) {
  const uuid = String(overrides?.[actorKey] ?? "").trim();
  if (!uuid) return null;
  const document = await resolveUuid(uuid);
  if (!document || document.documentName !== "Actor") {
    return { actorKey, status: "invalidOverride", source: "override", uuid };
  }
  const isWorld = !document.pack;
  return {
    actorKey,
    status: isWorld ? "resolved" : "requiresImport",
    source: "override",
    matchedName: document.name,
    name: document.name,
    uuid: document.uuid,
    id: document.id,
    pack: document.pack ?? null,
    document
  };
}

export async function resolveActorSpec(spec, options = {}) {
  const overrides = options.overrides ?? game.settings.get(MODULE_ID, SETTINGS.actorOverrides) ?? {};
  const override = await resolveOverride(spec.actorKey, overrides);
  if (override) return { ...override, requestedName: spec.actor, aliases: spec.aliases ?? [] };

  const names = spec.resolutionNames?.length
    ? Array.from(new Set(spec.resolutionNames))
    : [spec.actor, ...(spec.aliases ?? [])];
  const worldActors = Array.from(game.actors ?? []);
  let ambiguousWorld = null;
  for (const name of names) {
    const result = decide(exactMatches(worldActors, name).map((actor) => candidate(actor, "world")), "world", name, spec.sourcePreference);
    if (result?.status === "resolved") return { actorKey: spec.actorKey, requestedName: spec.actor, aliases: spec.aliases ?? [], ...result };
    if (result?.status === "ambiguous" && !ambiguousWorld) ambiguousWorld = result;
  }
  if (ambiguousWorld) {
    return { actorKey: spec.actorKey, requestedName: spec.actor, aliases: spec.aliases ?? [], ...ambiguousWorld };
  }

  const actorPacks = Array.from(game.packs ?? []).filter((pack) => pack.documentName === "Actor");
  const preferredIds = String(options.preferredPacks ?? game.settings.get(MODULE_ID, SETTINGS.preferredPacks) ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const preferred = preferredIds.map((id) => actorPacks.find((pack) => pack.collection === id)).filter(Boolean);
  const srd = actorPacks.filter((pack) => pack.collection === "dnd5e.monsters" && !preferred.includes(pack));
  const other = actorPacks.filter((pack) => !preferred.includes(pack) && !srd.includes(pack));

  for (const tier of [preferred, srd, other]) {
    let ambiguousTier = null;
    for (const name of names) {
      const matches = (await Promise.all(tier.map((pack) => packCandidates(pack, name)))).flat();
      const result = decide(matches, "compendium", name, spec.sourcePreference);
      if (result?.status === "requiresImport") return { actorKey: spec.actorKey, requestedName: spec.actor, aliases: spec.aliases ?? [], ...result };
      if (result?.status === "ambiguous" && !ambiguousTier) ambiguousTier = result;
    }
    if (ambiguousTier) return { actorKey: spec.actorKey, requestedName: spec.actor, aliases: spec.aliases ?? [], ...ambiguousTier };
  }

  return { actorKey: spec.actorKey, requestedName: spec.actor, aliases: spec.aliases ?? [], status: "unresolved" };
}

export async function resolveActors(levelData, options = {}) {
  const results = new Map();
  for (const spec of actorSpecs(levelData).values()) results.set(spec.actorKey, await resolveActorSpec(spec, options));
  debugLog("Actor resolution", { locationKey: levelData.locationKey, sceneKey: levelData.activeSceneKey, ...actorResolutionSummary(results) });
  return results;
}

export function actorResolutionSummary(results) {
  const summary = { resolved: 0, requiresImport: 0, ambiguous: 0, unresolved: 0, invalidOverride: 0 };
  for (const result of results.values()) summary[result.status] = (summary[result.status] ?? 0) + 1;
  return summary;
}

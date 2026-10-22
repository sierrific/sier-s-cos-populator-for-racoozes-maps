import fs from "node:fs";
import path from "node:path";
import { expectedCanvasBounds, sceneDefinitions } from "../racooze-cos-populator/scripts/scene-resolver.js";
import { validateLocationData } from "../racooze-cos-populator/scripts/validation.js";
import { SUPPORTED_CORE_GENERATIONS } from "../racooze-cos-populator/scripts/constants.js";

const root = path.resolve("racooze-cos-populator"); const errors = [];
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const manifest = readJson(path.join(root, "module.json")); const pkg = readJson("package.json"); const index = readJson(path.join(root, "data", "campaign-index.json"));
const fingerprints = readJson(path.join(root, "data", "scene-fingerprints.json"));
if (manifest.id !== "racooze-cos-populator") errors.push("Unexpected module id.");
if (manifest.title !== "Sier's CoS Populator for Racooze's Maps") errors.push("Unexpected module title.");
if (manifest.version !== pkg.version) errors.push("package.json and module.json versions differ.");
if (manifest.compatibility?.verified !== "12.331") errors.push("Foundry verified version must be 12.331.");
if (Number(manifest.compatibility?.minimum) !== Math.min(...SUPPORTED_CORE_GENERATIONS) || Number(manifest.compatibility?.maximum) !== Math.max(...SUPPORTED_CORE_GENERATIONS)) errors.push("Manifest compatibility range differs from runtime support.");
if (!manifest.relationships?.requires?.some((entry) => entry.id === "racoozes-cos-maps")) errors.push("Racooze dependency is missing.");
if (index.campaignKey !== "cos" || index.locations.length < 15) errors.push("Campaign index does not cover every Racooze location group.");

const forbiddenFields = new Set(["description", "entries", "statBlock", "statblock", "content", "html", "prose"]);
function inspect(value, pointer) { if (Array.isArray(value)) return value.forEach((item, i) => inspect(item, `${pointer}[${i}]`)); if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value)) { if (forbiddenFields.has(key)) errors.push(`Forbidden prose/stat-block field: ${pointer}.${key}`); inspect(child, `${pointer}.${key}`); } }

const summaries = [];
for (const entry of index.locations) {
  const data = readJson(path.join(root, "data", entry.file)); inspect(data, entry.key);
  data.scenes = (data.scenes ?? []).map((scene) => ({ ...scene, fingerprint: fingerprints.scenes?.[scene.sourceSceneId] ?? null }));
  for (const scene of data.scenes) if (!scene.fingerprint) errors.push(`Missing Scene fingerprint: ${entry.key}/${scene.key}.`);
  const runtimeValidation = validateLocationData(data);
  errors.push(...runtimeValidation.errors.map((message) => `${entry.key}: ${message}`));
  const scenes = sceneDefinitions(data); const sceneMap = new Map(scenes.map((scene) => [scene.key, scene])); const encounterIds = new Set(); const keys = new Set(); let automaticTokens = 0;
  if (data.locationKey !== entry.key) errors.push(`Location key mismatch: ${entry.key}.`);
  for (const encounter of data.encounters ?? []) {
    if (encounterIds.has(encounter.id)) errors.push(`Duplicate encounter id: ${encounter.id}`); encounterIds.add(encounter.id);
    if (!sceneMap.has(encounter.sceneKey)) errors.push(`Unknown Scene key in ${encounter.id}.`);
    const automatic = encounter.autoPopulate !== false;
    if (encounter.mode === "conditional" && (!encounter.warningCode || (encounter.tokens ?? []).some((token) => token.hidden !== true))) errors.push(`Conditional encounter must be hidden and carry a warning: ${encounter.id}.`);
    const anchor = Object.values(data.anchors ?? {}).find((candidate) => String(candidate.sceneKey) === String(encounter.sceneKey) && String(candidate.area ?? "") === String(encounter.area))
      ?? data.anchors?.[encounter.area];
    if (automatic && anchor?.verified !== true) errors.push(`Automatic encounter lacks a verified anchor: ${encounter.id}.`);
    if (anchor) { const scene = sceneMap.get(anchor.sceneKey); const bounds = scene && expectedCanvasBounds(scene); if (!bounds || anchor.x < 0 || anchor.y < 0 || anchor.x > bounds.width || anchor.y > bounds.height) errors.push(`Out-of-bounds anchor: ${encounter.area}.`); }
    for (const token of encounter.tokens ?? []) for (let instance = 1; instance <= token.count; instance += 1) { const key = `cos|${data.locationKey}|${encounter.sceneKey}|${encounter.area}|${encounter.id}|${token.actorKey}|${instance}`; if (keys.has(key)) errors.push(`Duplicate population key: ${key}`); keys.add(key); if (automatic) automaticTokens += 1; }
  }
  summaries.push({ location: data.locationKey, scenes: scenes.length, encounters: data.encounters.length, automaticTokens, reviewOnlyEncounters: data.encounters.filter((encounter) => encounter.autoPopulate === false).length, verifiedAnchors: Object.values(data.anchors ?? {}).filter((anchor) => anchor.verified === true).length });
}
const totalScenes = summaries.reduce((sum, item) => sum + item.scenes, 0);
if (totalScenes !== 36) errors.push(`Expected all 36 Racooze Scenes, found ${totalScenes}.`);
if (fingerprints.racoozeVersion !== "1.0.7" || Object.keys(fingerprints.scenes ?? {}).length !== totalScenes) errors.push("Scene fingerprint catalog does not match the tested Racooze inventory.");
for (const file of fs.readdirSync(root, { recursive: true, withFileTypes: true })) if (file.isFile() && [/5etools/i, /adventure-cos/i, /\.ldb$/i, /\.(?:webp|png|jpe?g|pdf)$/i].some((pattern) => pattern.test(file.name))) errors.push(`Forbidden packaged file: ${file.name}`);
for (const file of fs.readdirSync(path.join(root, "scripts"), { withFileTypes: true })) if (file.isFile() && file.name.endsWith(".js")) { const source = fs.readFileSync(path.join(root, "scripts", file.name), "utf8"); if (/SUPPORTED_LEVELS|loadLevelData|resolveLevelScene|flag\.level|cyren-dotmm/i.test(source)) errors.push(`Legacy level-based code remains: ${file.name}`); }
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; } else console.log(JSON.stringify({ ok: true, locations: summaries, packagedRawSources: false }, null, 2));

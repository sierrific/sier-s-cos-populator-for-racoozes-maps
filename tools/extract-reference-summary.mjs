import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node tools/extract-reference-summary.mjs <private-adventure-json> <ignored-output-json>");
  process.exit(2);
}

const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const maps = [];
const creatureReferences = [];
const areaIndex = new Map();
const creaturePattern = /\{@(?:creature|monster) ([^}|]+)(?:\|[^}]*)?}/gi;

function walk(value, headingPath = []) {
  if (typeof value === "string") {
    const creatures = [...value.matchAll(creaturePattern)].map((match) => match[1].trim());
    if (creatures.length) creatureReferences.push({ path: headingPath, creatures, sourceText: value });
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) walk(child, headingPath);
    return;
  }

  const nextPath = typeof value.name === "string" ? [...headingPath, value.name] : headingPath;
  if (typeof value.id === "string" && typeof value.name === "string") {
    areaIndex.set(value.id, { id: value.id, name: value.name, path: nextPath });
  }
  if (Array.isArray(value.mapRegions)) {
    maps.push({
      path: nextPath,
      href: value.href ?? null,
      imageType: value.imageType ?? null,
      width: value.width ?? null,
      height: value.height ?? null,
      grid: value.grid ?? null,
      scale: value.scale ?? null,
      keys: Object.keys(value),
      mapRegions: value.mapRegions.map((region) => ({
        area: region.area ?? region.name ?? null,
        points: region.points ?? region.polygon ?? null,
        page: region.page ?? null
      }))
    });
  }
  for (const child of Object.values(value)) walk(child, nextPath);
}

walk(source);
for (const map of maps) {
  for (const region of map.mapRegions) {
    const area = areaIndex.get(region.area);
    if (area) Object.assign(region, { areaName: area.name, areaPath: area.path });
  }
}
const output = {
  generatedAt: new Date().toISOString(),
  privateDiscoveryArtifact: true,
  areas: [...areaIndex.values()],
  maps,
  creatureReferences
};
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ maps: maps.length, creatureReferences: creatureReferences.length, outputPath }, null, 2));

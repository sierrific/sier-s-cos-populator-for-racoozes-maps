import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";

const [databasePath, outputPath] = process.argv.slice(2);
if (!databasePath) {
  console.error("Usage: node tools/inventory-racooze-scenes.mjs <pack-leveldb> [output-json]");
  process.exit(2);
}

const db = new ClassicLevel(databasePath, { createIfMissing: false, keyEncoding: "utf8", valueEncoding: "utf8" });
const sceneRoots = new Map();
const embedded = new Map();
try {
  await db.open();
  for await (const [key, raw] of db.iterator()) {
    const sceneMatch = key.match(/^!scenes!([^.]+)$/);
    if (sceneMatch) {
      sceneRoots.set(sceneMatch[1], JSON.parse(raw));
      continue;
    }
    const childMatch = key.match(/^!scenes\.([a-z]+)!([^.]+)\.(.+)$/);
    if (!childMatch) continue;
    const [, type, sceneId] = childMatch;
    const bucket = embedded.get(sceneId) ?? {};
    (bucket[type] ??= []).push(JSON.parse(raw));
    embedded.set(sceneId, bucket);
  }
} finally {
  await db.close();
}

const rows = [...sceneRoots.values()].map((scene) => {
  const children = embedded.get(scene._id) ?? {};
  const docs = (type) => children[type] ?? [];
  return {
    id: scene._id,
    name: scene.name,
    width: scene.width,
    height: scene.height,
    padding: scene.padding,
    grid: scene.grid?.size ?? scene.grid,
    background: scene.background?.src ?? scene.img ?? null,
    tokens: docs("tokens").length,
    walls: docs("walls").length,
    lights: docs("lights").length,
    notes: docs("notes").length,
    tiles: docs("tiles").map((tile) => ({
      id: tile._id,
      src: tile.texture?.src ?? tile.img ?? null,
      x: tile.x,
      y: tile.y,
      width: tile.width,
      height: tile.height,
      rotation: tile.rotation ?? 0,
      elevation: tile.elevation ?? tile.flags?.levels?.rangeBottom ?? 0,
      overhead: tile.overhead ?? false,
      sort: tile.sort ?? null,
      z: tile.z ?? null,
      hidden: tile.hidden ?? false,
      occlusionMode: tile.occlusion?.mode ?? null,
      restrictions: tile.restrictions ?? null,
      flags: tile.flags ?? {}
    })),
    drawings: docs("drawings").map((drawing) => ({
      id: drawing._id,
      x: drawing.x,
      y: drawing.y,
      shape: drawing.shape,
      elevation: drawing.elevation ?? drawing.flags?.levels?.rangeBottom ?? 0,
      flags: drawing.flags ?? {}
    })),
    flagScopes: scene.flags ? Object.keys(scene.flags) : [],
    flags: scene.flags ?? {}
  };
});

rows.sort((a, b) => a.name.localeCompare(b.name));
const json = `${JSON.stringify({ generatedAt: new Date().toISOString(), scenes: rows }, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, json, "utf8");
} else process.stdout.write(json);

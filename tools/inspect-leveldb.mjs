import { ClassicLevel } from "classic-level";

const [databasePath, mode = "summary"] = process.argv.slice(2);
if (!databasePath) {
  console.error("Usage: node tools/inspect-leveldb.mjs <database-path> [summary|json|scene:<id>]");
  process.exitCode = 2;
} else {
  const db = new ClassicLevel(databasePath, { createIfMissing: false, keyEncoding: "utf8", valueEncoding: "utf8" });
  try {
    await db.open(); const rows = [];
    for await (const [key, raw] of db.iterator()) {
      let value; try { value = JSON.parse(raw); } catch { value = raw; }
      if (mode === "json") { rows.push({ key, value }); continue; }
      if (mode.startsWith("scene:")) {
        const id = mode.slice(6); if (key === `!scenes!${id}` || key.startsWith(`!scenes.tokens!${id}.`)) rows.push({ key, value }); continue;
      }
      if (!/^!scenes![^.]+$/.test(key)) continue;
      rows.push({ key, id: value?._id, name: value?.name, width: value?.width, height: value?.height, padding: value?.padding, grid: value?.grid?.size ?? value?.grid, tokens: value?.tokens?.length ?? 0, walls: value?.walls?.length ?? 0, lights: value?.lights?.length ?? 0, tiles: value?.tiles?.length ?? 0, drawings: value?.drawings?.length ?? 0, flagScopes: value?.flags ? Object.keys(value.flags) : [] });
    }
    console.log(JSON.stringify(rows, null, 2));
  } finally { await db.close(); }
}

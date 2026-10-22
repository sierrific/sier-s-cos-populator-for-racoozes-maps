import fs from "node:fs";

const [summaryPath, pathPattern, scaleArg, sourceXArg, sourceYArg, sceneXArg = "0", sceneYArg = "0", elevationArg = "0", outputPath] = process.argv.slice(2);
if (!summaryPath || !pathPattern || !scaleArg || sourceXArg === undefined || sourceYArg === undefined) {
  console.error("Usage: node tools/project-reference-regions.mjs <summary-json> <path-regex> <scale> <source-origin-x> <source-origin-y> [scene-x] [scene-y] [elevation]");
  process.exit(2);
}

const matcher = new RegExp(pathPattern, "i");
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));
const scale = Number(scaleArg);
const sourceX = Number(sourceXArg);
const sourceY = Number(sourceYArg);
const sceneX = Number(sceneXArg);
const sceneY = Number(sceneYArg);
const elevation = Number(elevationArg);
const slug = (value) => String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const outputs = [];
for (const map of summary.maps.filter((item) => matcher.test(item.path.join(" > ")) && item.imageType === "map")) {
  const regions = map.mapRegions.map((region) => {
    const points = region.points ?? [];
    const x = points.reduce((sum, point) => sum + Number(point[0]), 0) / points.length;
    const y = points.reduce((sum, point) => sum + Number(point[1]), 0) / points.length;
    return {
      area: slug(String(region.areaName ?? region.area).replace(/^([A-Z]+\d+[a-z]?|\d+[A-Z]?)\.\s*/i, "$1-")),
      sourceAreaId: region.area,
      areaName: region.areaName,
      source: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
      projected: {
        x: Math.round((sceneX + (x - sourceX) * scale) * 10) / 10,
        y: Math.round((sceneY + (y - sourceY) * scale) * 10) / 10,
        elevation
      }
    };
  });
  outputs.push({ path: map.path, sourceGrid: map.grid, transform: { scale, sourceX, sourceY, sceneX, sceneY, elevation }, regions });
}
const text = JSON.stringify(outputs.length === 1 ? outputs[0] : outputs, null, 2);
if (outputPath) fs.writeFileSync(outputPath, `${text}\n`, "utf8");
else console.log(text);

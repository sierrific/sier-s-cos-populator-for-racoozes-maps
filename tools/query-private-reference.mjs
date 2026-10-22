import fs from "node:fs";

const [inputPath, pattern] = process.argv.slice(2);
if (!inputPath || !pattern) {
  console.error("Usage: node tools/query-private-reference.mjs <private-json> <path-regex>");
  process.exit(2);
}

const source = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const matcher = new RegExp(pattern, "i");
function walk(value, headingPath = []) {
  if (typeof value === "string") {
    if (matcher.test(headingPath.join(" > "))) console.log(`${headingPath.join(" > ")}\n${value}\n`);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) return value.forEach((child) => walk(child, headingPath));
  const nextPath = typeof value.name === "string" ? [...headingPath, value.name] : headingPath;
  for (const child of Object.values(value)) walk(child, nextPath);
}
walk(source);

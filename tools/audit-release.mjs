import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.resolve();
const moduleRoot = path.join(root, "racooze-cos-populator");
const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(moduleRoot, "module.json"), "utf8"));
const constants = fs.readFileSync(path.join(moduleRoot, "scripts", "constants.js"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
const errors = [];
const textExtensions = new Set([".css", ".hbs", ".js", ".json", ".md"]);

function archiveBytes(file) {
  const source = fs.readFileSync(file);
  if (!textExtensions.has(path.extname(file).toLowerCase())) return source;
  return Buffer.from(source.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function listFiles(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(absolute, relative) : [relative.replaceAll("\\", "/")];
    });
}

function zipEntries(buffer) {
  const entries = [];
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = buffer.lastIndexOf(endSignature);
  if (endOffset < 0 || endOffset + 22 > buffer.length) throw new Error("ZIP end-of-central-directory record is missing.");
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let offset = buffer.readUInt32LE(endOffset + 16);
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("ZIP central directory is malformed.");
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    entries.push({
      name: buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"),
      flags: buffer.readUInt16LE(offset + 8),
      method: buffer.readUInt16LE(offset + 10),
      time: buffer.readUInt16LE(offset + 12),
      day: buffer.readUInt16LE(offset + 14),
      crc32: buffer.readUInt32LE(offset + 16),
      compressedSize: buffer.readUInt32LE(offset + 20),
      size: buffer.readUInt32LE(offset + 24),
      externalAttributes: buffer.readUInt32LE(offset + 38),
      localOffset: buffer.readUInt32LE(offset + 42)
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryContents(archive, entry) {
  const offset = entry.localOffset;
  if (offset + 30 > archive.length || archive.readUInt32LE(offset) !== 0x04034b50) throw new Error(`Malformed local ZIP entry: ${entry.name}`);
  const nameLength = archive.readUInt16LE(offset + 26);
  const extraLength = archive.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const payload = archive.subarray(start, start + entry.compressedSize);
  if (payload.length !== entry.compressedSize) throw new Error(`Truncated ZIP entry: ${entry.name}`);
  if (entry.method === 0) return payload;
  if (entry.method === 8) return zlib.inflateRawSync(payload);
  throw new Error(`Unsupported ZIP compression method ${entry.method}: ${entry.name}`);
}

function validateMarkdownLinks(file) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/!?(?:\[[^\]]*\])\(([^)]+)\)/g)) {
    let target = match[1].trim().replace(/^<|>$/g, "").split("#", 1)[0];
    if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
    try {
      target = decodeURIComponent(target);
    } catch {
      errors.push(`Malformed link encoding in ${path.relative(root, file)}: ${target}`);
      continue;
    }
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) errors.push(`Broken local link in ${path.relative(root, file)}: ${target}`);
  }
}

if (manifest.version !== packageMetadata.version) errors.push("package.json and module.json versions differ.");
if (JSON.stringify(manifest.languages?.map((entry) => entry.lang)) !== JSON.stringify(["en"])) {
  errors.push("The release module must expose English localization only.");
}
if (fs.existsSync(path.join(moduleRoot, "lang", "pt-BR.json"))) errors.push("Obsolete Portuguese localization is still packaged.");
const constantVersion = constants.match(/MODULE_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (constantVersion !== manifest.version) errors.push("MODULE_VERSION and module.json versions differ.");

const expectedArchiveName = `${manifest.id}-${manifest.version}.zip`;
const expectedDownload = `https://github.com/sierrific/sier-s-cos-populator-for-racoozes-maps/releases/download/v${manifest.version}/${expectedArchiveName}`;
if (manifest.download !== expectedDownload) errors.push("Manifest download URL does not match the current version.");

const archivePath = path.join(root, "dist", expectedArchiveName);
const checksumPath = `${archivePath}.sha256`;
if (!fs.existsSync(archivePath)) errors.push(`Missing built archive: dist/${expectedArchiveName}`);
if (!fs.existsSync(checksumPath)) errors.push(`Missing checksum: dist/${expectedArchiveName}.sha256`);

if (fs.existsSync(archivePath)) {
  const archive = fs.readFileSync(archivePath);
  const expectedFiles = listFiles(moduleRoot);
  let archiveEntries = [];
  try {
    archiveEntries = zipEntries(archive).sort((left, right) => left.name.localeCompare(right.name));
  } catch (error) {
    errors.push(error.message);
  }
  const actualFiles = archiveEntries.map((entry) => entry.name);
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) errors.push("ZIP contents differ from the module source tree.");
  if (actualFiles.some((entry) => path.posix.isAbsolute(entry) || entry.split("/").includes(".."))) errors.push("ZIP contains an unsafe path.");
  if (!actualFiles.includes("module.json")) errors.push("ZIP does not contain module.json at its root.");
  if (archiveEntries.some((entry) => ((entry.externalAttributes >>> 16) & 0xffff) !== 0o100644)) {
    errors.push("ZIP file permissions are not portable Unix 0644 entries.");
  }
  if (archiveEntries.some((entry) => entry.method !== 0)) errors.push("ZIP entries must use deterministic store mode.");
  if (archiveEntries.some((entry) => entry.time !== 0 || entry.day !== 33)) errors.push("ZIP entries do not use the fixed 1980-01-01 timestamp.");
  if (archiveEntries.some((entry) => (entry.flags & 0x0800) === 0)) errors.push("ZIP entry names are not explicitly UTF-8.");
  for (const entry of archiveEntries) {
    try {
      const expected = archiveBytes(path.join(moduleRoot, ...entry.name.split("/")));
      const actual = entryContents(archive, entry);
      if (actual.length !== entry.size || !actual.equals(expected)) errors.push(`ZIP entry bytes differ from source: ${entry.name}`);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (fs.existsSync(checksumPath)) {
    const actualHash = crypto.createHash("sha256").update(archive).digest("hex");
    const recordedHash = fs.readFileSync(checksumPath, "utf8").trim().split(/\s+/, 1)[0];
    if (actualHash !== recordedHash) errors.push("ZIP checksum file does not match the archive.");
  }
}

for (const requiredAsset of [
  "dist/racooze-cos-populator-*.zip",
  "dist/racooze-cos-populator-*.zip.sha256",
  "installer/install.ps1",
  "installer/install.sh"
]) {
  if (!workflow.includes(requiredAsset)) errors.push(`Release workflow omits ${requiredAsset}.`);
}

for (const file of [
  path.join(root, "README.md"),
  path.join(root, "CHANGELOG.md"),
  path.join(root, "docs", "INSTALLATION.md"),
  path.join(root, "docs", "COVERAGE.md"),
  path.join(root, "docs", "DEVELOPMENT.md"),
  path.join(root, "docs", "TECHNICAL.md"),
  path.join(root, "docs", "USER-GUIDE.md"),
  path.join(root, "docs", "VALIDATION.md"),
  path.join(root, "docs", "FOUNDRY-V14.md"),
  path.join(root, "THIRD_PARTY_NOTICES.md"),
  path.join(moduleRoot, "THIRD_PARTY_NOTICES.md"),
  path.join(moduleRoot, "README.md")
]) validateMarkdownLinks(file);

const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
if (!workflow.includes("dist/module.json")) errors.push("Release workflow omits the Foundry installer manifest.");
const builtManifest = path.join(root, "dist", "module.json");
if (!fs.existsSync(builtManifest) || !fs.readFileSync(builtManifest).equals(archiveBytes(path.join(moduleRoot, "module.json")))) errors.push("Standalone release manifest differs from module source.");
if (!readme.includes("all 36 Scenes")) errors.push("README does not state the campaign-wide Racooze Scene scope.");
if (!readme.includes(expectedArchiveName)) errors.push("README does not name the current installer ZIP.");
if (!readme.includes(manifest.manifest)) errors.push("README does not contain the current manifest URL.");

for (const installer of ["install.ps1", "install.sh"]) {
  const source = fs.readFileSync(path.join(root, "installer", installer), "utf8");
  if (!source.includes(manifest.id)) errors.push(`${installer} does not target the module id.`);
  if (!/symbolic link/i.test(source)) errors.push(`${installer} does not reject symbolic links in release ZIPs.`);
  if (installer === "install.sh" && !source.startsWith("#!/usr/bin/env bash\n")) errors.push("install.sh must begin with a BOM-free Bash shebang.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    version: manifest.version,
    archive: `dist/${expectedArchiveName}`,
    files: listFiles(moduleRoot).length,
    documentationLinks: "valid",
    checksum: "valid",
    entryBytes: "canonical-source-identical",
    compression: "store",
    unixPermissions: "0644"
  }, null, 2));
}

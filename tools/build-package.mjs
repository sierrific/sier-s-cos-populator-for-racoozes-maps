import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const moduleDirectory = path.resolve("racooze-cos-populator");
const manifest = JSON.parse(fs.readFileSync(path.join(moduleDirectory, "module.json"), "utf8"));
const outputDirectory = path.resolve("dist");
const outputPath = path.join(outputDirectory, `${manifest.id}-${manifest.version}.zip`);
const checksumPath = `${outputPath}.sha256`;
const archiveDate = new Date(Date.UTC(1980, 0, 1, 0, 0, 0));
const textExtensions = new Set([".css", ".hbs", ".js", ".json", ".md"]);

function archiveBytes(file) {
  const source = fs.readFileSync(file);
  if (!textExtensions.has(path.extname(file).toLowerCase())) return source;
  return Buffer.from(source.toString("utf8").replace(/\r\n?/g, "\n"), "utf8");
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date) {
  const year = Math.max(1980, date.getUTCFullYear());
  const time = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  return { time, day };
}

function listFiles(directory, prefix = "") {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(absolute, relative) : [{ absolute, relative }];
    });
}

const localRecords = [];
const centralRecords = [];
let offset = 0;

for (const file of listFiles(moduleDirectory)) {
  const name = Buffer.from(file.relative.replaceAll("\\", "/"), "utf8");
  const source = archiveBytes(file.absolute);
  const checksum = crc32(source);
  const { time, day } = dosTimestamp(archiveDate);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0x0800, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(time, 10);
  localHeader.writeUInt16LE(day, 12);
  localHeader.writeUInt32LE(checksum, 14);
  localHeader.writeUInt32LE(source.length, 18);
  localHeader.writeUInt32LE(source.length, 22);
  localHeader.writeUInt16LE(name.length, 26);
  localHeader.writeUInt16LE(0, 28);
  localRecords.push(localHeader, name, source);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(0x0314, 4);
  centralHeader.writeUInt16LE(20, 6);
  centralHeader.writeUInt16LE(0x0800, 8);
  centralHeader.writeUInt16LE(0, 10);
  centralHeader.writeUInt16LE(time, 12);
  centralHeader.writeUInt16LE(day, 14);
  centralHeader.writeUInt32LE(checksum, 16);
  centralHeader.writeUInt32LE(source.length, 20);
  centralHeader.writeUInt32LE(source.length, 24);
  centralHeader.writeUInt16LE(name.length, 28);
  centralHeader.writeUInt16LE(0, 30);
  centralHeader.writeUInt16LE(0, 32);
  centralHeader.writeUInt16LE(0, 34);
  centralHeader.writeUInt16LE(0, 36);
  centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38);
  centralHeader.writeUInt32LE(offset, 42);
  centralRecords.push(centralHeader, name);

  offset += localHeader.length + name.length + source.length;
}

const centralDirectory = Buffer.concat(centralRecords);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(centralRecords.length / 2, 8);
end.writeUInt16LE(centralRecords.length / 2, 10);
end.writeUInt32LE(centralDirectory.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.mkdirSync(outputDirectory, { recursive: true });
const archive = Buffer.concat([...localRecords, centralDirectory, end]);
const sha256 = crypto.createHash("sha256").update(archive).digest("hex");
fs.writeFileSync(outputPath, archive);
fs.writeFileSync(checksumPath, `${sha256}  ${path.basename(outputPath)}\n`, "utf8");
fs.writeFileSync(path.join(outputDirectory, "module.json"), archiveBytes(path.join(moduleDirectory, "module.json")));
console.log(JSON.stringify({ output: outputPath, checksum: checksumPath, sha256, files: centralRecords.length / 2, bytes: archive.length }, null, 2));

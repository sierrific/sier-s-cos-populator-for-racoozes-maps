# Development

Use Node.js 20 or later.

CI and release workflows use `npm ci --ignore-scripts` with `package-lock.json`, followed by `npm audit`. Release checks do not require the native LevelDB discovery tools, so dependency build scripts are intentionally not run in CI.

```text
pnpm install --frozen-lockfile
npm run validate
npm test
npm run build
npm run audit
```

Raw discovery data belongs only in `.discovery-temp/`, which is ignored. `tools/inventory-racooze-scenes.mjs` and `tools/inspect-leveldb.mjs` are read-only discovery utilities. Never copy source adventures, statblocks, map images, or World databases into the module directory.

`tools/test-foundry-compatibility.mjs` runs API-contract fixtures for generations 12, 13, and 14 through `npm test`. Keep new development utilities under `tools/`. Do not raise the manifest's `verified` version based solely on mocked tests; follow the [live v14 checklist](FOUNDRY-V14.md).

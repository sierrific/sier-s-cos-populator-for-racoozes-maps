export function plutoniumStatus() {
  const module = game.modules.get("plutonium");
  const importerApi = module?.api?.importer;
  return {
    installed: Boolean(module),
    active: Boolean(module?.active),
    version: module?.version ?? null,
    hasCreatureImporter: Boolean(importerApi?.pOpen || importerApi?.pGetImporter)
  };
}

async function selectCreatureImporter() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const creatureButton = Array.from(document.querySelectorAll("button"))
      .find((button) => button.textContent?.trim() === "Creatures" && button.closest(".window-app, .application"));
    if (creatureButton) { creatureButton.click(); return true; }
  }
  return false;
}

export async function openPlutoniumCreatureImporter() {
  const status = plutoniumStatus();
  if (!status.active) throw new Error("Plutonium is not active in this World.");
  if (status.hasCreatureImporter) {
    const importerApi = game.modules.get("plutonium").api.importer;
    if (importerApi.pOpen) { await importerApi.pOpen(); await selectCreatureImporter(); return true; }
    const importer = await importerApi.pGetImporter({ page: "bestiary.html" });
    if (importer?.render) {
      importer.render(true);
      return importer;
    }
  }

  const sidebarButton = Array.from(document.querySelectorAll("button"))
    .find((button) => button.textContent?.trim().includes("Plutonium Import"));
  if (!sidebarButton) throw new Error("Plutonium is active, but its importer button is not available in the sidebar.");
  sidebarButton.click();

  await selectCreatureImporter();
  return true;
}

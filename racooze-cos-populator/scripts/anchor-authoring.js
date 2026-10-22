import { saveManualAnchor } from "./anchor-resolver.js";

import { levelId } from "./compatibility.js";

let activeCleanup = null;

export function cancelAnchorAuthoring() {
  activeCleanup?.();
  activeCleanup = null;
}

export async function authorAnchor(scene, area, radius = null) {
  if (!canvas?.ready || canvas.scene?.id !== scene.id) throw new Error("Activate the target Scene before authoring an anchor.");
  cancelAnchorAuthoring();
  ui.notifications.info(`Sier's CoS Populator: click the center for area ${area}. Press Escape to cancel.`);

  return new Promise((resolve, reject) => {
    const stage = canvas.stage;
    const previousEventMode = stage.eventMode;
    stage.eventMode = "static";

    const cleanup = () => {
      stage.off("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      stage.eventMode = previousEventMode;
      if (activeCleanup === cancel) activeCleanup = null;
    };
    const cancel = () => { cleanup(); reject(new Error("Anchor authoring cancelled.")); };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      cancel();
    };
    const onPointerDown = async (event) => {
      const point = event.getLocalPosition ? event.getLocalPosition(stage) : event.data.getLocalPosition(stage);
      cleanup();
      try {
        const saved = await saveManualAnchor(scene, area, { x: point.x, y: point.y, radius, level: levelId(canvas.level), elevation: canvas.level?.elevation?.bottom ?? null });
        ui.notifications.info(`Anchor ${area} saved at ${Math.round(saved.x)}, ${Math.round(saved.y)}.`);
        resolve(saved);
      } catch (error) {
        reject(error);
      }
    };
    activeCleanup = cancel;
    stage.on("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
  });
}

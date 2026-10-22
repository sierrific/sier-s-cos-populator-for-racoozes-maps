import { MODULE_ID, SETTINGS } from "./constants.js";

export function debugLog(event, details = {}) {
  let enabled = false;
  try {
    enabled = Boolean(game.settings.get(MODULE_ID, SETTINGS.debug));
  } catch {
    return;
  }
  if (enabled) console.debug(`${MODULE_ID} | ${event}`, details);
}

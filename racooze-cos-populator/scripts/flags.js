import { CAMPAIGN_KEY, MODULE_ID, MODULE_VERSION } from "./constants.js";

const TOKEN_FLAG_SCHEMA_VERSION = 1;
const KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function makeTokenFlag({ locationKey, sceneKey, area, encounterId, actorKey, instance }) {
  return {
    campaign: CAMPAIGN_KEY,
    locationKey,
    sceneKey,
    area,
    encounterId,
    actorKey,
    instance,
    schemaVersion: TOKEN_FLAG_SCHEMA_VERSION,
    moduleVersion: MODULE_VERSION
  };
}

export function getPopulationFlag(token) {
  const flag = token?.flags?.[MODULE_ID] ?? null;
  return isPopulationFlag(flag) ? flag : null;
}

export function isPopulationFlag(flag) {
  return Boolean(
    flag
    && typeof flag === "object"
    && flag.campaign === CAMPAIGN_KEY
    && Number(flag.schemaVersion) === TOKEN_FLAG_SCHEMA_VERSION
    && KEY_PATTERN.test(String(flag.locationKey ?? ""))
    && KEY_PATTERN.test(String(flag.sceneKey ?? ""))
    && KEY_PATTERN.test(String(flag.area ?? ""))
    && KEY_PATTERN.test(String(flag.encounterId ?? ""))
    && KEY_PATTERN.test(String(flag.actorKey ?? ""))
    && Number.isInteger(Number(flag.instance))
    && Number(flag.instance) >= 1
  );
}

export function populationKey(flag) {
  if (!isPopulationFlag(flag)) return null;
  return [flag.campaign, flag.locationKey, flag.sceneKey, flag.area, flag.encounterId, flag.actorKey, flag.instance].join("|");
}

export function isModuleToken(token) {
  return getPopulationFlag(token) !== null;
}

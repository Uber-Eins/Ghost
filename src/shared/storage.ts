import { allProfiles, findProfile, PRESET_PROFILE_IDS, stableProfileIdForSite } from "./profiles";
import { isExcluded, siteKeyFromUrl } from "./site";
import type { GhostSettings, Profile, ResolvedProfile, BuildTarget } from "./types";
import { stableSeed } from "./hash";
import { normalizeTimezoneId } from "./locations";

export const STORAGE_KEY = "ghost.settings";

export const DEFAULT_SETTINGS: GhostSettings = {
  enabled: true,
  advancedEnabled: true,
  siteProfiles: {},
  siteNonces: {},
  excludedDomains: [],
  temporaryDisabledUntil: null,
  customProfiles: [],
  hiddenPresetProfileIds: []
};

let settingsWriteQueue: Promise<void> = Promise.resolve();

export function normalizeSettings(input: unknown): GhostSettings {
  const candidate = typeof input === "object" && input !== null ? input as Partial<GhostSettings> : {};
  const customProfiles = Array.isArray(candidate.customProfiles)
    ? candidate.customProfiles.filter(isProfileLike).map(normalizeProfile)
    : [];
  const hiddenPresetProfileIds = normalizeHiddenPresetProfileIds(candidate.hiddenPresetProfileIds, customProfiles);
  const siteNonces = normalizeNumberRecord(candidate.siteNonces);
  const profiles = allProfiles(customProfiles, hiddenPresetProfileIds);
  return {
    enabled: candidate.enabled ?? DEFAULT_SETTINGS.enabled,
    advancedEnabled: candidate.advancedEnabled ?? DEFAULT_SETTINGS.advancedEnabled,
    siteProfiles: normalizeSiteProfiles(candidate.siteProfiles, profiles, siteNonces),
    siteNonces,
    excludedDomains: Array.isArray(candidate.excludedDomains) ? candidate.excludedDomains.filter(isString) : [],
    temporaryDisabledUntil: typeof candidate.temporaryDisabledUntil === "number" ? candidate.temporaryDisabledUntil : null,
    customProfiles,
    hiddenPresetProfileIds
  };
}

export async function loadSettings(): Promise<GhostSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY]);
}

export async function saveSettings(settings: GhostSettings): Promise<void> {
  await enqueueSettingsWrite(() => writeSettings(settings));
}

export async function updateSettings(mutator: (settings: GhostSettings) => void | Promise<void>): Promise<GhostSettings> {
  return enqueueSettingsWrite(async () => {
    const settings = await loadSettings();
    await mutator(settings);
    const normalized = normalizeSettings(settings);
    await writeSettings(normalized);
    return normalized;
  });
}

async function writeSettings(settings: GhostSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: normalizeSettings(settings) });
}

function enqueueSettingsWrite<T>(operation: () => Promise<T>): Promise<T> {
  const pending = settingsWriteQueue.then(operation, operation);
  settingsWriteQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export function profilesFromSettings(settings: GhostSettings): Profile[] {
  return allProfiles(settings.customProfiles, settings.hiddenPresetProfileIds);
}

export function isTemporarilyDisabled(settings: GhostSettings, now = Date.now()): boolean {
  return settings.temporaryDisabledUntil !== null && settings.temporaryDisabledUntil > now;
}

export function headerRulesAllowed(settings: GhostSettings, now = Date.now()): boolean {
  return settings.enabled && !isTemporarilyDisabled(settings, now);
}

export function ensureSiteAssignment(settings: GhostSettings, siteKey: string): string {
  const profiles = profilesFromSettings(settings);
  const current = settings.siteProfiles[siteKey];
  if (current && profiles.some((profile) => profile.id === current)) {
    return current;
  }
  const nonce = settings.siteNonces[siteKey] ?? 0;
  const profileId = stableProfileIdForSite(siteKey, profiles, nonce);
  settings.siteProfiles[siteKey] = profileId;
  return profileId;
}

export function resolveProfile(
  url: string,
  settings: GhostSettings,
  build: BuildTarget,
  now = Date.now()
): ResolvedProfile {
  const siteKey = siteKeyFromUrl(url);
  const profileId = ensureSiteAssignment(settings, siteKey);
  const profile = findProfile(profileId, settings.customProfiles, settings.hiddenPresetProfileIds);
  const temporarilyDisabled = isTemporarilyDisabled(settings, now);
  const excluded = isExcluded(siteKey, settings.excludedDomains);
  const enabled = settings.enabled && !temporarilyDisabled && !excluded;

  return {
    build,
    enabled,
    reason: !settings.enabled ? "global-disabled" : temporarilyDisabled ? "temporary-disabled" : excluded ? "excluded-domain" : undefined,
    siteKey,
    seed: stableSeed(siteKey, profile.id),
    profile,
    advanced: {
      available: build === "advanced",
      attempted: false,
      applied: false
    }
  };
}

function normalizeSiteProfiles(value: unknown, profiles: Profile[], siteNonces: Record<string, number>): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const entries: Array<[string, string]> = [];
  for (const [siteKey, profileId] of Object.entries(value as Record<string, unknown>)) {
    if (!isString(siteKey) || !isString(profileId)) {
      continue;
    }
    entries.push([
      siteKey,
      profileIds.has(profileId)
        ? profileId
        : stableProfileIdForSite(siteKey, profiles, siteNonces[siteKey] ?? 0)
    ]);
  }
  return Object.fromEntries(entries);
}

function normalizeHiddenPresetProfileIds(value: unknown, customProfiles: Profile[]): string[] {
  const hidden = Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && PRESET_PROFILE_IDS.has(entry)))]
    : [];
  return allProfiles(customProfiles, hidden).length > 0 ? hidden : [];
}

function normalizeNumberRecord(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter((entry): entry is [string, number] => isString(entry[0]) && typeof entry[1] === "number")
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    timezoneId: normalizeTimezoneId(profile.timezoneId)
  };
}

function isProfileLike(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const profile = value as Partial<Profile>;
  return typeof profile.id === "string"
    && typeof profile.label === "string"
    && typeof profile.locale === "string"
    && typeof profile.intlLocale === "string"
    && Array.isArray(profile.languages)
    && typeof profile.timezoneId === "string"
    && typeof profile.latitude === "number"
    && typeof profile.longitude === "number"
    && typeof profile.acceptLanguage === "string"
    && typeof profile.platform === "string";
}

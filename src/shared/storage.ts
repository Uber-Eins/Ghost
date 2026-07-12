import { allProfiles, findProfile, PRESET_PROFILE_IDS, stableProfileIdForSite } from "./profiles";
import {
  bestMatchingSiteRule,
  DEFAULT_EXCLUDED_DOMAINS,
  DEFAULT_SITE_RULE,
  isExcludedUrl,
  normalizeExclusionRule,
  normalizeSiteRuleKey,
  siteKeyFromUrl
} from "./site";
import type { GhostSettings, Profile, ResolvedProfile, BuildTarget } from "./types";
import { stableSeed } from "./hash";
import { normalizeTimezoneId } from "./locations";

export const STORAGE_KEY = "ghost.settings";
export const EXCLUDED_DEFAULTS_VERSION = 1;
export { DEFAULT_EXCLUDED_DOMAINS };
export const SETTINGS_LIMITS = Object.freeze({
  customProfiles: 200,
  siteProfileRules: 500,
  exclusionRules: 400
});
const MAX_CUSTOM_PROFILES = SETTINGS_LIMITS.customProfiles;
const MAX_SITE_PROFILE_RULES = SETTINGS_LIMITS.siteProfileRules;
const MAX_EXCLUSION_RULES = SETTINGS_LIMITS.exclusionRules;
const MAX_HEADER_VALUE_LENGTH = 1024;

export const DEFAULT_SETTINGS: GhostSettings = {
  enabled: true,
  globalPrivacyControlEnabled: true,
  advancedEnabled: true,
  disableUserAgentSpoofing: false,
  siteProfiles: {
    [DEFAULT_SITE_RULE]: defaultProfileIdForSiteRule(DEFAULT_SITE_RULE, allProfiles([]), 0)
  },
  siteNonces: {},
  excludedDomains: [...DEFAULT_EXCLUDED_DOMAINS],
  excludedDefaultsVersion: EXCLUDED_DEFAULTS_VERSION,
  temporaryDisabledUntil: null,
  customProfiles: [],
  hiddenPresetProfileIds: []
};

let settingsWriteQueue: Promise<void> = Promise.resolve();

export function normalizeSettings(input: unknown): GhostSettings {
  const candidate = typeof input === "object" && input !== null ? input as Partial<GhostSettings> : {};
  const customProfiles = normalizeCustomProfiles(candidate.customProfiles);
  const hiddenPresetProfileIds = normalizeHiddenPresetProfileIds(candidate.hiddenPresetProfileIds, customProfiles);
  const siteNonces = normalizeSiteNonces(candidate.siteNonces);
  const profiles = allProfiles(customProfiles, hiddenPresetProfileIds);
  const siteProfiles = normalizeSiteProfiles(candidate.siteProfiles, profiles, siteNonces);
  return {
    enabled: booleanValue(candidate.enabled, DEFAULT_SETTINGS.enabled),
    globalPrivacyControlEnabled: booleanValue(
      candidate.globalPrivacyControlEnabled,
      DEFAULT_SETTINGS.globalPrivacyControlEnabled
    ),
    advancedEnabled: booleanValue(candidate.advancedEnabled, DEFAULT_SETTINGS.advancedEnabled),
    disableUserAgentSpoofing: booleanValue(candidate.disableUserAgentSpoofing, DEFAULT_SETTINGS.disableUserAgentSpoofing),
    siteProfiles: ensureDefaultSiteProfile(siteProfiles, profiles, siteNonces),
    siteNonces,
    excludedDomains: normalizeExcludedDomains(candidate.excludedDomains, candidate.excludedDefaultsVersion),
    excludedDefaultsVersion: EXCLUDED_DEFAULTS_VERSION,
    temporaryDisabledUntil: finiteNumberOrNull(candidate.temporaryDisabledUntil),
    customProfiles,
    hiddenPresetProfileIds
  };
}

export async function loadSettings(): Promise<GhostSettings> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(result[STORAGE_KEY]);
}

export async function readSettings(): Promise<GhostSettings> {
  return enqueueSettingsWrite(loadSettings);
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
  const normalizedSiteKey = normalizeSiteRuleKey(siteKey);
  if (!normalizedSiteKey) {
    return "";
  }
  const profiles = profilesFromSettings(settings);
  const current = settings.siteProfiles[normalizedSiteKey];
  if (current && profiles.some((profile) => profile.id === current)) {
    return current;
  }
  const nonce = settings.siteNonces[normalizedSiteKey] ?? 0;
  const profileId = defaultProfileIdForSiteRule(normalizedSiteKey, profiles, nonce);
  settings.siteProfiles[normalizedSiteKey] = profileId;
  return profileId;
}

export function resolveProfile(
  url: string,
  settings: GhostSettings,
  build: BuildTarget,
  now = Date.now(),
  partitionUrl = url
): ResolvedProfile {
  // Profile selection and fingerprint seeds are partitioned by the top-level
  // site. Callers resolving a subframe pass its URL as `url` (so document
  // exclusions still work) and the trusted tab URL as `partitionUrl`.
  const siteKey = siteKeyFromUrl(partitionUrl);
  const profileId = profileIdForSiteKey(siteKey, settings);
  const profile = findProfile(profileId, settings.customProfiles, settings.hiddenPresetProfileIds);
  const temporarilyDisabled = isTemporarilyDisabled(settings, now);
  const excluded = isExcludedUrl(url, settings.excludedDomains);
  const enabled = settings.enabled && !temporarilyDisabled && !excluded;
  const uaSpoofingEnabled = enabled && !settings.disableUserAgentSpoofing;

  return {
    build,
    enabled,
    globalPrivacyControlEnabled: settings.globalPrivacyControlEnabled,
    uaSpoofingEnabled,
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

export function profileIdForSiteKey(siteKey: string, settings: GhostSettings): string {
  const profiles = profilesFromSettings(settings);
  const ruleKey = bestMatchingSiteRule(siteKey, Object.keys(settings.siteProfiles));
  if (ruleKey) {
    return settings.siteProfiles[ruleKey] ?? defaultProfileIdForSiteRule(ruleKey, profiles, settings.siteNonces[ruleKey] ?? 0);
  }
  return defaultProfileIdForSiteRule(siteKey, profiles, settings.siteNonces[siteKey] ?? 0);
}

function normalizeSiteProfiles(value: unknown, profiles: Profile[], siteNonces: Record<string, number>): Record<string, string> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const entries = new Map<string, string>();
  for (const [siteKey, profileId] of Object.entries(value as Record<string, unknown>)) {
    const normalizedSiteKey = normalizeSiteRuleKey(siteKey);
    if (!normalizedSiteKey || !isString(profileId)) {
      continue;
    }
    entries.set(
      normalizedSiteKey,
      profileIds.has(profileId)
        ? profileId
        : defaultProfileIdForSiteRule(normalizedSiteKey, profiles, siteNonces[normalizedSiteKey] ?? 0)
    );
  }
  const defaultEntry = entries.get(DEFAULT_SITE_RULE);
  entries.delete(DEFAULT_SITE_RULE);
  const limitedEntries = [...entries.entries()].slice(0, MAX_SITE_PROFILE_RULES - 1);
  if (defaultEntry) {
    limitedEntries.unshift([DEFAULT_SITE_RULE, defaultEntry]);
  }
  return Object.fromEntries(limitedEntries);
}

function ensureDefaultSiteProfile(siteProfiles: Record<string, string>, profiles: Profile[], siteNonces: Record<string, number>): Record<string, string> {
  if (siteProfiles[DEFAULT_SITE_RULE] && profiles.some((profile) => profile.id === siteProfiles[DEFAULT_SITE_RULE])) {
    return siteProfiles;
  }
  return {
    ...siteProfiles,
    [DEFAULT_SITE_RULE]: defaultProfileIdForSiteRule(DEFAULT_SITE_RULE, profiles, siteNonces[DEFAULT_SITE_RULE] ?? 0)
  };
}

function defaultProfileIdForSiteRule(siteKey: string, profiles: Profile[], nonce: number): string {
  if (siteKey === DEFAULT_SITE_RULE && nonce === 0) {
    return profiles[0]?.id ?? "";
  }
  return stableProfileIdForSite(siteKey, profiles, nonce);
}

function normalizeHiddenPresetProfileIds(value: unknown, customProfiles: Profile[]): string[] {
  const hidden = Array.isArray(value)
    ? [...new Set(value.filter((entry): entry is string => typeof entry === "string" && PRESET_PROFILE_IDS.has(entry)))]
    : [];
  return allProfiles(customProfiles, hidden).length > 0 ? hidden : [];
}

function normalizeSiteNonces(value: unknown): Record<string, number> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const entries = new Map<string, number>();
  for (const [siteKey, nonce] of Object.entries(value as Record<string, unknown>)) {
    const normalizedSiteKey = normalizeSiteRuleKey(siteKey);
    if (normalizedSiteKey && typeof nonce === "number" && Number.isFinite(nonce) && nonce >= 0) {
      entries.set(normalizedSiteKey, Math.floor(nonce));
      if (entries.size >= MAX_SITE_PROFILE_RULES) {
        break;
      }
    }
  }
  return Object.fromEntries(entries);
}

function normalizeExcludedDomains(value: unknown, version: unknown): string[] {
  const entries = Array.isArray(value)
    ? value.map((entry) => typeof entry === "string" ? normalizeExclusionRule(entry) : "").filter(Boolean)
    : DEFAULT_EXCLUDED_DOMAINS;
  const normalized = typeof version === "number" && version >= EXCLUDED_DEFAULTS_VERSION
    ? [...new Set(entries)]
    : [...new Set([...DEFAULT_EXCLUDED_DOMAINS, ...entries])];
  return normalized.slice(0, MAX_EXCLUSION_RULES);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeProfile(profile: Profile): Profile {
  const fallback = findProfile(undefined, []);
  const locale = normalizeLocale(profile.locale, fallback.locale);
  return {
    ...fallback,
    ...profile,
    id: sanitizeIdentifier(profile.id),
    label: boundedString(profile.label, fallback.label, 256),
    locale,
    intlLocale: normalizeLocale(profile.intlLocale, locale),
    languages: normalizeLocaleList(profile.languages, fallback.languages),
    timezoneId: normalizeTimezoneId(nonEmptyString(profile.timezoneId, fallback.timezoneId).slice(0, 128)),
    latitude: clampedNumber(profile.latitude, fallback.latitude, -90, 90),
    longitude: clampedNumber(profile.longitude, fallback.longitude, -180, 180),
    accuracy: clampedNumber(profile.accuracy, fallback.accuracy, 0, 1_000_000),
    acceptLanguage: sanitizeHeaderValue(profile.acceptLanguage) || fallback.acceptLanguage,
    platform: normalizePlatform(profile.platform, fallback.platform),
    architecture: normalizeArchitecture(profile.architecture),
    userAgent: sanitizeUserAgent(profile.userAgent),
    uaMode: profile.uaMode === "native" ? "native" : "desktop-chromium",
    hardwareConcurrency: Math.min(256, Math.max(1, Math.round(finiteNumber(profile.hardwareConcurrency, fallback.hardwareConcurrency)))),
    deviceMemory: normalizeDeviceMemory(profile.deviceMemory, fallback.deviceMemory),
    canvasSeedPolicy: "site",
    webglVendor: boundedString(profile.webglVendor, fallback.webglVendor, 1024),
    webglRenderer: boundedString(profile.webglRenderer, fallback.webglRenderer, 1024)
  };
}

function normalizeArchitecture(value: unknown): string {
  return value === "arm" ? "arm" : "x86";
}

function sanitizeUserAgent(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^\u0020-\u007e]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_HEADER_VALUE_LENGTH)
    : "";
}

function sanitizeHeaderValue(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[^\u0020-\u007e]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_HEADER_VALUE_LENGTH)
    : "";
}

function normalizeCustomProfiles(value: unknown): Profile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const profilesById = new Map<string, Profile>();
  for (const entry of value) {
    if (!isProfileLike(entry)) {
      continue;
    }
    const profile = normalizeProfile(entry);
    if (profile.id) {
      profilesById.set(profile.id, profile);
    }
    if (profilesById.size >= MAX_CUSTOM_PROFILES) {
      break;
    }
  }
  return [...profilesById.values()];
}

function sanitizeIdentifier(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]+/g, "").trim().slice(0, 128)
    : "";
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  const normalized = nonEmptyString(value, fallback);
  return normalized.slice(0, maxLength);
}

function normalizeLocale(value: unknown, fallback: string): string {
  const candidate = nonEmptyString(value, fallback).slice(0, 128);
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizeLocaleList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const locales: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !entry.trim()) {
      continue;
    }
    try {
      const locale = Intl.getCanonicalLocales(entry.trim())[0];
      if (locale && !locales.includes(locale)) {
        locales.push(locale);
        if (locales.length >= 16) {
          break;
        }
      }
    } catch {
      // Ignore malformed language tags rather than breaking every Intl call.
    }
  }
  return locales.length > 0 ? locales : [...fallback];
}

function normalizePlatform(value: unknown, fallback: string): string {
  return value === "Win32" || value === "MacIntel" || value === "Linux x86_64" ? value : fallback;
}

function normalizeDeviceMemory(value: unknown, fallback: number): number {
  const candidate = finiteNumber(value, fallback);
  const buckets = [0.25, 0.5, 1, 2, 4, 8];
  return buckets.reduce((best, bucket) => (
    Math.abs(bucket - candidate) < Math.abs(best - candidate) ? bucket : best
  ), buckets[0]);
}

function clampedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, fallback)));
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isProfileLike(value: unknown): value is Profile {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const profile = value as Partial<Profile>;
  return isString(profile.id)
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
